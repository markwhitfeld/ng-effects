import { ConnectedComponent, createConnectedComponent, declare, provide } from "./utils"
import { afterViewInit, inject, onChanges, onDestroy, whenRendered } from "../connect"
import { connectable } from "../providers"
import { ComponentFixture, fakeAsync, TestBed, tick } from "@angular/core/testing"
import { timer } from "rxjs"
import { Component, InjectionToken } from "@angular/core"
import { Connectable } from "../connectable.directive"
import fn = jest.fn
import Mock = jest.Mock
import { watchEffect } from "../utils"

export function detectChangesAfterEach(fixture: ComponentFixture<any>, values: any[]) {
    for (const value of values) {
        fixture.componentInstance.fakeProp = value
        fixture.detectChanges()
    }
}

const SPY = new InjectionToken<Mock>("SPY")

@Component({
    template: `
        <div>{{ name }}</div>
        <count></count>
    `,
})
export class ParentComponent extends Connectable {
    name = "bogus"
    ngOnConnect() {
        const spy = inject(SPY)

        watchEffect(() => spy(1))
        onChanges(() => {
            spy(2)
            watchEffect(() => spy(3))
        })
        afterViewInit(() => {
            spy(4)
            watchEffect(() => spy(5))
        })
        whenRendered(() => {
            spy(6)
            watchEffect(() => spy(7))
        })
        onDestroy(() => {
            spy(8)
            watchEffect(() => spy(9))
        })
    }
}

@Component({
    selector: "count",
    template: `
        {{ count }}
    `,
})
export class CountComponent extends Connectable {
    count = 0

    incrementCount() {
        this.count += 1
    }

    ngOnConnect() {
        const spy = inject(SPY)

        watchEffect(() => spy(10))
        onChanges(() => {
            spy(11)
            watchEffect(() => spy(12))
        })
        afterViewInit(() => {
            spy(13)
            watchEffect(() => spy(14))
        })
        whenRendered(() => {
            spy(15)
            watchEffect(() => spy(16))
        })
        onDestroy(() => {
            spy(17)
            watchEffect(() => spy(18))
        })
    }
}

describe("effect", () => {
    beforeEach(() => declare(ConnectedComponent, ParentComponent, CountComponent))
    beforeEach(() =>
        provide({
            provide: SPY,
            useValue: fn(),
        }),
    )

    it("should execute synchronously", () => {
        let subject, expected: any, connect

        given: expected = fn()
        given: connect = () => {
            watchEffect(expected)
        }
        given: subject = createConnectedComponent()
        given: subject.componentInstance.ngOnConnect = connect

        when: {
            subject.detectChanges()
        }

        then: expect(expected).toHaveBeenCalledTimes(1)
    })

    it("should execute inside lifecycle hooks", () => {
        let subject, expected: any, connect

        given: expected = fn()
        given: connect = () => {
            onChanges(expected)
            afterViewInit(expected)
            whenRendered(expected)
            onDestroy(expected)
        }
        given: subject = createConnectedComponent()
        given: subject.componentInstance.ngOnConnect = connect

        when: {
            subject.detectChanges()
            subject.destroy()
        }

        then: expect(expected).toHaveBeenCalledTimes(4)
    })

    it("should flush effects each time a lifecycle hook is called", fakeAsync(() => {
        let subject, expected: any, connect

        given: expected = fn(() =>
            timer(1000).subscribe(() => {
                throw new Error("Teardown not disposed")
            }),
        )
        given: connect = () => {
            onChanges(() => watchEffect(expected)) // x10
            afterViewInit(() => watchEffect(expected)) // x2)
            whenRendered(() => watchEffect(expected)) // x10
            onDestroy(() => watchEffect(expected)) // x2
        }
        given: subject = createConnectedComponent(connectable(connect))
        given: subject.componentInstance.ngOnConnect = connect

        when: {
            detectChangesAfterEach(subject, [1, 2, 3, 4, 5])
            subject.destroy()
            tick(10000)
        }

        then: expect(expected).toHaveBeenCalledTimes(24)
    }))

    it("should flush effects when reactive dependencies change", fakeAsync(() => {
        let subject, expected: any, connect

        given: expected = fn()
        given: connect = function(this: any, state?: any) {
            watchEffect(() => {
                expected()
                // ngOnConnect receives a reactive `this` context.
                // Connectable functions receive a reactive `state` argument.
                this ? this.fakeProp : state.fakeProp
                return timer(1000).subscribe(() => {
                    throw new Error("Teardown not disposed")
                })
            })
        }
        given: subject = createConnectedComponent(connectable(connect))
        given: subject.componentInstance.ngOnConnect = connect

        when: {
            detectChangesAfterEach(subject, [1, 2, 3, 4, 5])
            subject.destroy()
            tick(10000)
        }

        // called twice for each change detection (5x2)
        then: expect(expected).toHaveBeenCalledTimes(10)
    }))

    it("should call hooks in the right order", () => {
        let subject, expected

        given: expected = TestBed.inject(SPY)
        given: subject = TestBed.createComponent(ParentComponent)

        when: {
            subject.detectChanges()
            subject.destroy()
        }

        then: expect(expected.mock.calls).toEqual([
            [1],
            [2],
            [3],
            [10],
            [11],
            [12],
            [13],
            [14],
            [15],
            [16],
            [4],
            [5],
            [6],
            [7],
            [17],
            [18],
            [8],
            [9],
        ])
    })
})
