import {
    AbstractType,
    ChangeDetectorRef,
    InjectFlags,
    InjectionToken,
    Injector,
    KeyValueChanges,
    KeyValueDiffers,
    Type,
    ViewContainerRef,
} from "@angular/core"
import { Context, EffectHook, EffectOptions, LifecycleHook, OnConnect } from "./interfaces"
import { CONNECTABLE } from "./constants"
import { Subject, TeardownLogic } from "rxjs"
import { getLifecycleHook, setLifecycleHook } from "./lifecycle"

type CleanupMap = Map<LifecycleHook, Set<TeardownLogic>>

const injectorMap = new WeakMap<Context, Injector>()
const cleanupMap = new WeakMap<Context, CleanupMap>()
const effects = new Map<EffectHook, EffectOptions>()
const hooksMap = new WeakMap<Context, Map<LifecycleHook, Set<EffectHook>>>()
const schedulerMap = new WeakMap<Context, Subject<LifecycleHook | undefined>>()

let activeContext: undefined | Context

export function throwMissingInjectorError(): never {
    throw new Error("[ngfx] Injector not found.")
}

export function throwMissingContextError(): never {
    throw new Error("[ngfx] Invalid execution context")
}

export function getInjector(context: Context = getContext()) {
    const injector = injectorMap.get(context)

    if (!injector) {
        throwMissingInjectorError()
    }

    return injector
}

export function getContext<T extends object>(): T {
    if (activeContext) {
        return activeContext as T
    } else {
        throwMissingContextError()
    }
}

export function schedule(lifecycle: LifecycleHook, context: Context = getContext()) {
    runInContext(context, lifecycle, () => getScheduler(context).next(lifecycle))
}

export function getScheduler(context = getContext()): Subject<LifecycleHook | undefined> {
    return schedulerMap.get(context) || schedulerMap.set(context, new Subject()).get(context)!
}

export function setContext(context?: any) {
    activeContext = context
}

export function inject<T>(
    token: Type<T> | AbstractType<T> | InjectionToken<T>,
    flags: InjectFlags,
): T | null
export function inject<T>(token: Type<T> | AbstractType<T> | InjectionToken<T>): T
export function inject<T>(
    token: Type<T> | AbstractType<T> | InjectionToken<T>,
    flags?: InjectFlags,
): T | null {
    const nodeInjector = getInjector()
    // Workaround for https://github.com/angular/angular/issues/31776
    if (flags) {
        let parent: Injector
        try {
            parent = nodeInjector.get(ViewContainerRef as Type<any>)?.parentInjector
        } catch {
            throw new Error(
                "This injector is a temporary workaround that can only be used inside a `connectable()` or `ngOnConnect()` call. For other injection contexts, please import `inject()` from @angular/core. Related issue: https://github.com/angular/angular/issues/31776",
            )
        }
        const optional = Boolean(flags & InjectFlags.Optional) ? null : undefined
        if (Boolean(flags & InjectFlags.SkipSelf) && parent) {
            return parent.get(token, optional)
        }
        if (Boolean(flags & InjectFlags.Self)) {
            const current: T = nodeInjector.get(token as any, null)
            const parentExists = parent ? parent.get(token, null) : null
            if (optional === null && parentExists === current) {
                return null
            }
            if (parentExists === null || parentExists !== current) {
                return current
            } else {
                throw new Error(
                    `EXCEPTION: No provider for ${"name" in token ? token.name : token.toString()}`,
                )
            }
        }
    }

    return nodeInjector.get(token)
}

export function getHooks() {
    return hooksMap.get(getContext())
}

export function flush(cleanup: Set<TeardownLogic>) {
    for (const teardown of cleanup) {
        unsubscribe(teardown)
    }
    cleanup.clear()
}

const invalidationsMap = new WeakMap<Context, Map<Function, typeof depsMap>>()
const previousValues = new WeakMap<Context, any[] | undefined>()

function getInvalidations(context: Context) {
    return invalidationsMap.get(context) || invalidationsMap.set(context, new Map()).get(context)!
}

function getPreviousValues(object: any) {
    return previousValues.get(object) || previousValues.set(object, undefined).get(object)
}

function setPreviousValues(object: any, values: any[]) {
    previousValues.set(object, values)
}

function getCurrentValues(deps: Map<any, Set<any>>) {
    const current: any = []
    Array.from(deps).map(([context, keys]) => {
        Array.from(keys).map(key => {
            current.push(context[key])
        })
    })
    return current
}

export function invalidateEffects(target: Context) {
    const invalidations = getInvalidations(target)
    const run = new Set<Function>()
    for (const [invalidate, deps] of invalidations) {
        const current = getCurrentValues(deps)
        const previous = getPreviousValues(deps) || []
        setPreviousValues(deps, current)

        if (current === previous) {
            break
        }
        if (current.length !== previous.length) {
            run.add(invalidate())
            break
        }
        for (const [index, value] of current.entries()) {
            if (previous[index] !== value) {
                run.add(invalidate())
                break
            }
        }
    }
    for (const fn of run) {
        fn()
    }
}

export function runEffect(context: Context, effect: EffectHook, options: EffectOptions, cleanup: Set<TeardownLogic>) {
    flushDeps()
    effects.delete(effect)
    const teardown = effect()
    const deps = options.watch ? flushDeps() : new Map()
    const invalidations = getInvalidations(context)
    const invalidation = () => {
        cleanup.delete(teardown)
        invalidations.delete(invalidation)
        unsubscribe(teardown)
        previousValues.delete(deps)
        return function () {
            runEffect(context, effect, options, cleanup)
        }
    }
    setPreviousValues(deps, getCurrentValues(deps))
    invalidations.set(invalidation, deps)
    cleanup.add(teardown)
}

export function runEffects(context: Context, cleanup: Set<TeardownLogic>) {
    for (const [effect, options] of effects) {
        runEffect(context, effect, options, cleanup)
    }
}

export function runHooks(
    lifecycle: LifecycleHook,
    hooks: Set<EffectHook>,
    cleanup: Set<TeardownLogic>,
) {
    const scheduler = getScheduler()
    const context = getContext()

    scheduler.subscribe({
        next: current => {
            if (current === lifecycle) {
                flush(cleanup)
                for (const hook of hooks) {
                    runInContext(context, lifecycle, () => {
                        cleanup.add(hook())
                        runEffects(context, cleanup)
                    })
                }
            }
        },
        error: error => {
            flush(cleanup)
            console.error(error)
        },
        complete: () => flush(cleanup),
    })
}

export function unsubscribe(teardown: TeardownLogic) {
    if (typeof teardown === "function") {
        teardown()
    } else if (teardown && "unsubscribe" in teardown) {
        teardown.unsubscribe()
    }
}

export function noop() {}

export function hasChanges(diff: KeyValueChanges<any, any> | null): boolean {
    if (diff === null) {
        return false
    }
    let hasChanges = false
    diff.forEachItem(record => {
        if (record.currentValue !== record.previousValue) {
            hasChanges = true
        }
    })
    return hasChanges
}

export function runScheduler() {
    const iterableDiffers = inject(KeyValueDiffers)
    const scheduler = getScheduler()
    const context: { [key: string]: any } = getContext()
    const changeDetectorRef = inject(ChangeDetectorRef)
    const differ = iterableDiffers.find(context).create()
    let changed = true

    scheduler.subscribe(lifecycle => {
        switch (lifecycle) {
            case LifecycleHook.DoCheck: {
                invalidateEffects(context)
                if (hasChanges(differ.diff(context))) {
                    changed = true
                    changeDetectorRef.markForCheck()
                    scheduler.next(LifecycleHook.OnChanges)
                }
                break
            }
            case LifecycleHook.AfterViewChecked: {
                if (changed) {
                    changed = false
                    runInContext(context, LifecycleHook.WhenRendered, () =>
                        scheduler.next(LifecycleHook.WhenRendered),
                    )
                }
                break
            }
            case LifecycleHook.OnDestroy: {
                scheduler.complete()
                scheduler.unsubscribe()
            }
        }
    })

    schedule(LifecycleHook.OnInit)
}

export function setup() {
    const initializers = inject(CONNECTABLE, InjectFlags.Self | InjectFlags.Optional)
    const context = getContext<Partial<OnConnect>>()
    const reactive = reactiveFactory(context)
    const cleanup = cleanupMap.get(context) as Map<LifecycleHook, Set<TeardownLogic>>

    if (context.ngOnConnect) {
        context.ngOnConnect.call(reactive)
    }

    if (initializers) {
        for (const initializer of initializers) {
            initializer(reactive)
        }
    }

    addHook(noop, LifecycleHook.OnInit)

    const hooksMap = getHooks()

    for (const [lifecycle, hooks] of hooksMap!) {
        runHooks(lifecycle, hooks, cleanup.get(lifecycle)!)
    }

    runScheduler()
}

export function runInContext<T extends (...args: any[]) => any>(
    context: any,
    lifecycle: LifecycleHook | undefined,
    func: T,
): ReturnType<T> {
    setContext(context)
    setLifecycleHook(lifecycle)
    const returnValue = func()
    setContext()
    setLifecycleHook()
    return returnValue
}

export function connect(context: Context, injector: Injector) {
    const cleanup = new Map()
    const lifecycle = new Map()

    injectorMap.set(context, injector)
    hooksMap.set(context, lifecycle)
    cleanupMap.set(context, cleanup)

    for (const index of Array.from({ length: 6 }).keys()) {
        cleanup.set(index, new Set<TeardownLogic>())
        lifecycle.set(index, new Set<EffectHook>())
    }

    setContext(context)
}

export function init(context: any) {
    const hostInjector = getInjector(context)
    const injector = Injector.create({
        parent: hostInjector,
        providers: [
            {
                provide: setup,
                useFactory: setup,
                deps: [],
            },
        ],
    })

    runInContext(context, LifecycleHook.OnInit, () => injector.get(setup))
}

export function addEffect(fn: EffectHook, options: EffectOptions = {}) {
    effects.set(fn, options)
}

export function addHook(fn: EffectHook, lifecycle: LifecycleHook) {
    hooksMap
        .get(getContext())
        ?.get(lifecycle)
        ?.add(fn)
}

export const depsMap = new Map<{ [key: string]: any }, Set<string | number>>()

export function getDeps(object: object) {
    return depsMap.get(object) || depsMap.set(object, new Set()).get(object)!
}

export function addDeps(object: Context, key: any) {
    getDeps(object).add(key)
}

export function flushDeps() {
    const deps = new Map(depsMap)
    depsMap.clear()
    return deps
}

const cache = new WeakMap()

export function reactiveFactory<T extends object>(source: T, opts: any = { shallow: true }) {
    const context = getContext()
    return new Proxy<T>(source, {
        get(target: T, p: PropertyKey, receiver: any): any {
            const value = Reflect.get(target, p, receiver)
            const desc = Object.getOwnPropertyDescriptor(target, p)
            if (desc && desc.enumerable) {
                addDeps(target, p)
            }
            if ((desc && !desc.writable && !desc.configurable) || opts.shallow) {
                return value
            }
            if (typeof value === "object" && value !== null) {
                if (cache.has(value)) {
                    return cache.get(value)
                }
                console.log('deep')
                const state = reactiveFactory(value, opts)
                cache.set(value, state)
                return state
            } else return value
        },
        set(target: T, p: PropertyKey, value: any, receiver: any): boolean {
            const success = Reflect.set(target, p, value, receiver)
            check(context)
            return success
        },
    })
}

export function onChanges(fn: () => TeardownLogic) {
    addHook(fn, LifecycleHook.OnChanges)
}

export function afterViewInit(fn: () => TeardownLogic) {
    addHook(fn, LifecycleHook.AfterViewInit)
}

export function whenRendered(fn: () => TeardownLogic) {
    addHook(fn, LifecycleHook.WhenRendered)
}

export function onDestroy(fn: () => TeardownLogic) {
    addHook(fn, LifecycleHook.OnDestroy)
}

export function check(context: any) {
    schedule(LifecycleHook.DoCheck, context)
}

export function viewInit(context: any) {
    schedule(LifecycleHook.AfterViewInit, context)
}

export function viewChecked(context: any) {
    schedule(LifecycleHook.AfterViewChecked, context)
}

export function destroy(context: any) {
    schedule(LifecycleHook.OnDestroy, context)
}