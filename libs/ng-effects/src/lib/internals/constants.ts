import { DefaultEffectOptions, EffectFn } from "../interfaces"
import { Subject } from "rxjs"

export const effectsMap = new WeakMap<EffectFn<any>, any>()

export const defaultOptions: Required<DefaultEffectOptions> = {
    whenRendered: false,
    detectChanges: false,
    markDirty: false,
}

export const globalNotifier = new Subject()
