import { getInjector, runInContext } from "../connect"
import { connectable } from "../providers"
import fn = jest.fn
import {
    ConnectedComponent,
    createConnectedComponent,
    createInjector,
    declare,
    FAKE_INJECTOR,
    provide,
} from "./utils"
import { ChangeDetectorRef, ViewContainerRef } from "@angular/core"

describe("connect", () => {
    beforeEach(() => declare(ConnectedComponent))

    it("should connect the component injector", () => {
        let subject, expected, result

        given: expected = createInjector()
        given: provide(
            {
                provide: FAKE_INJECTOR,
                useValue: expected,
            },
            {
                provide: ChangeDetectorRef,
                useValue: null,
            },
            {
                provide: ViewContainerRef,
                useValue: {
                    parentInjector: expected,
                },
            },
        )
        given: subject = createConnectedComponent()

        when: {
            subject.detectChanges()
            result = runInContext(subject.componentInstance, undefined, () => getInjector())
        }

        then: expect(result).toBe(expected)
    })

    it("should call ngOnConnect", () => {
        let subject, expected

        given: subject = createConnectedComponent()
        given: expected = spyOn(subject.componentInstance, "ngOnConnect")

        when: subject.detectChanges()

        then: expect(expected).toHaveBeenCalledTimes(1)
    })

    it("should call host initializers", () => {
        let subject, expected

        given: expected = fn()
        given: subject = createConnectedComponent(connectable(expected))

        when: subject.detectChanges()

        then: expect(expected).toHaveBeenCalledTimes(1)
        then: expect(expected).toHaveBeenCalledWith(subject.componentInstance)
    })
})
