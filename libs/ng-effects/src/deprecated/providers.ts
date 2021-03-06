import { INJECTOR } from "@angular/core"
import { ViewRenderer } from "./view-renderer"
import { connectFactory } from "./internals/connect-factory"
import { ExperimentalIvyViewRenderer } from "./internals/experimental-view-renderer"
import { createEffectsFactory } from "./internals/utils"
import { DefaultEffectOptions } from "./interfaces"
import { Connect } from "./connect"
import { HOST_INITIALIZER } from "./constants"
import { CONNECT_EFFECTS, EFFECTS, HOST_REF, RUN_EFFECTS } from "./internals/providers"
import { DestroyObserver } from "./internals/destroy-observer"

/**
 * @deprecated Will be replaced by composition API in 10.0.0
 */
export const CONNECT = [
    {
        provide: Connect,
        useFactory: connectFactory,
        deps: [HOST_INITIALIZER, INJECTOR],
    },
    HOST_REF,
]

/**
 * @deprecated Will be replaced by composition API in 10.0.0
 */
export function effects(effectOptions?: DefaultEffectOptions) {
    return [
        {
            provide: EFFECTS,
            useFactory: createEffectsFactory(effectOptions),
        },
    ]
}

/**
 * @deprecated Will be replaced by composition API in 10.0.0
 */
export const Effects = [CONNECT, CONNECT_EFFECTS, RUN_EFFECTS, DestroyObserver]

/**
 * @deprecated Will be replaced by composition API in 10.0.0
 */
export const USE_EXPERIMENTAL_RENDER_API = [
    {
        provide: ViewRenderer,
        useClass: ExperimentalIvyViewRenderer,
    },
]
