import { ChangeDetectorRef, Injector, NgZone, Type } from "@angular/core"
import { isObservable, Subject } from "rxjs"
import { ViewRenderer } from "../view-renderer"
import { EffectMetadata, EffectOptions } from "../interfaces"
import { take } from "rxjs/operators"
import { assertPropertyExists, isTeardownLogic, throwBadReturnTypeError } from "./utils"
import { DestroyObserver } from "./destroy-observer"
import { HostRef } from "./host-ref"
import { globalDefaults } from "./constants"

function effectRunner(
    effectsMetadata: EffectMetadata[],
    hostRef: HostRef,
    observer: DestroyObserver,
    notifier: Subject<any>,
    injector: Injector,
) {
    let whenRendered = false
    const hostType = Object.getPrototypeOf(hostRef.context).constructor
    return function runEffects() {
        hostRef.tick()
        for (const metadata of effectsMetadata) {
            if (metadata.options.whenRendered === whenRendered) {
                runEffect(hostRef, hostType, metadata, observer, notifier, injector)
            }
        }
        whenRendered = true
    }
}

function sortArguments(arr: number[], index: number[], n: number) {
    const temp: number[] = Array.from({ length: 3 })
    for (let i = 0; i < n; i++) {
        temp[index[i]] = arr[i]
    }
    for (let i = 0; i < n; i++) {
        if (temp[i] !== undefined) {
            arr[i] = temp[i]
        }
        index[i] = i
    }
    return arr
}

function runEffect(
    hostRef: HostRef,
    hostType: Type<any>,
    metadata: EffectMetadata,
    destroy: DestroyObserver,
    notifier: Subject<any>,
    injector: Injector,
) {
    const { context, state, observer } = hostRef
    const { args, type, name, options, path } = metadata
    const sortedArgs = sortArguments([state, context, observer], args, 3)
    const effect = type === hostType ? context : injector.get(type)
    const returnValue = effect[name].apply(effect, sortedArgs)

    if (returnValue === undefined) {
        return
    } else if (isObservable(returnValue)) {
        destroy.add(
            returnValue.subscribe({
                next(value: any) {
                    const { assign, bind } = options

                    if (options.adapter) {
                        const adapter = injector.get(options.adapter)
                        adapter.next(value, metadata)
                    }

                    if (assign) {
                        for (const prop of Object.keys(value)) {
                            assertPropertyExists(prop, context)
                            context[prop] = value[prop]
                        }
                    } else if (bind) {
                        assertPropertyExists(bind, context)
                        context[bind] = value
                    }

                    notifier.next(options)
                },
                error(error: any) {
                    console.error(`[ng-effects] Uncaught error in effect: ${path}`)
                    console.error(error)
                },
            }),
        )
    } else if (isTeardownLogic(returnValue)) {
        destroy.add(returnValue)
    } else {
        throwBadReturnTypeError()
    }
}

export function runEffects(
    effectsMetadata: EffectMetadata[],
    hostRef: HostRef,
    changeDetector: ChangeDetectorRef,
    destroyObserver: DestroyObserver,
    viewRenderer: ViewRenderer,
    injector: Injector,
    parentRef: HostRef,
) {
    let createMode = true
    const changeNotifier = new Subject<any>()
    const rendered = viewRenderer.whenRendered().pipe(take(1))
    const scheduled = viewRenderer.whenScheduled()
    const runEffects = effectRunner(
        effectsMetadata,
        hostRef,
        destroyObserver,
        changeNotifier,
        injector,
    )

    const detectChanges = async function(opts: EffectOptions = globalDefaults) {
        hostRef.tick()
        if (parentRef) {
            parentRef.tick()
        }
        if (opts.detectChanges) {
            viewRenderer.detectChanges(hostRef.context, changeDetector)
        } else if (opts.markDirty) {
            // async workaround for "noop" zone
            if (createMode || !NgZone.isInAngularZone()) {
                await Promise.resolve()
            }
            viewRenderer.markDirty(hostRef.context, changeDetector)
        }
    }

    // Start event loop
    destroyObserver.add(
        scheduled.subscribe(changeNotifier),
        rendered.subscribe(runEffects),
        changeNotifier.subscribe(detectChanges),
    )

    runEffects()
    createMode = false
}
