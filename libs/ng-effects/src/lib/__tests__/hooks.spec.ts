import { ConnectedComponent, createConnectedComponent, declare } from "./utils"
import fn = jest.fn
import Mock = jest.Mock
import { afterViewInit, onChanges, onDestroy, whenRendered } from "../connect"
import { effect, watchEffect } from "../utils"

const hooks = [watchEffect, effect, onChanges, afterViewInit, whenRendered, onDestroy]

describe("lifecycle hooks", () => {
    beforeEach(() => declare(ConnectedComponent))

    for (const hook of hooks) {
        it(`should run ${hook.name}() hooks`, async () => {
            let subject, expected: Mock, connect

            given: expected = fn()
            given: connect = () => {
                hook(expected)
            }
            given: subject = createConnectedComponent()
            given: subject.componentInstance.ngOnConnect = connect

            when: {
                subject.detectChanges()
                await subject.whenRenderingDone()
                subject.destroy()
            }

            then: expect(expected).toHaveBeenCalledTimes(1)
        })
    }
})
