// Metro always resolves imports of "./MapViewContainer" to the .native.tsx or
// .web.tsx sibling for their respective platforms — this bare file only
// exists so plain `tsc` (which doesn't know about RN platform extensions)
// has something to type-check the shared interface against.
export { default } from './MapViewContainer.native';
export * from './MapViewContainer.types';
