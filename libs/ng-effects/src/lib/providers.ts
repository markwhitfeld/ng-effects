import { RunEffects } from "./internals/run-effects"
import { EFFECTS, HOST_INITIALIZER, HostRef } from "./constants"
import { Injector, NgZone, Type } from "@angular/core"
import { DestroyObserver } from "./internals/destroy-observer"
import { ViewRenderer } from "./internals/view-renderer"
import { ConnectFactory } from "./internals/connect-factory"
import { ExperimentalIvyViewRenderer } from "./internals/experimental-view-renderer"
import { createHostRef, injectEffectsFactory } from "./internals/utils"
import { DefaultEffectOptions } from "./interfaces"
import { EVENT_MANAGER_PLUGINS, EventManager } from "@angular/platform-browser"
import { ZonelessEventManager } from "./internals/zoneless-event-manager"
import { STATE_FACTORY } from "./internals/providers"

export function effects(types: Type<any> | Type<any>[] = [], effectOptions?: DefaultEffectOptions) {
    return [
        {
            provide: EFFECTS,
            useFactory: injectEffectsFactory(types, effectOptions),
            deps: [HostRef, Injector],
        },
        {
            provide: Connect,
            useClass: ConnectFactory,
        },
        {
            provide: HostRef,
            useFactory: createHostRef,
            deps: [STATE_FACTORY],
        },
        {
            provide: HOST_INITIALIZER,
            useValue: RunEffects,
            multi: true,
        },
        DestroyObserver,
        RunEffects,
        types,
    ]
}

export interface Connect {
    // tslint:disable-next-line
    <T>(context: T): void
}

export abstract class Connect {}

export const HOST_EFFECTS = effects()

export const USE_EXPERIMENTAL_RENDER_API = [
    {
        provide: ViewRenderer,
        useClass: ExperimentalIvyViewRenderer,
    },
    {
        provide: EventManager,
        useFactory: (plugins: any[], zone: NgZone) => {
            try {
                return NgZone.isInAngularZone()
                    ? new EventManager(plugins, zone)
                    : new ZonelessEventManager(plugins, zone)
            } catch {
                return new ZonelessEventManager(plugins, zone)
            }
        },
        deps: [EVENT_MANAGER_PLUGINS, NgZone],
    },
]
