/* The package's one entry point. A consumer imports from '@keel/geo' and
   never from a path inside src/, so a module can move within the package
   without touching any of them. Every reader produces the shared Track type
   (kml/parse), which is where a FIT reader would sit beside KML and GPX. */
export * from './kml/parse'
export * from './kml/stats'
export * from './geo/overview'
export * from './geo/overviewLines'
export * from './geo/tripTotals'
export * from './geo/elevation'
export * from './map/geo'
export * from './map/fitBounds'
export * from './map/palette'
export * from './map/cluster'
export * from './map/motion'
