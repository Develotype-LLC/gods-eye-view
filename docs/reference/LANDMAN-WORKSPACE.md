# Landman workspace

The standalone app opens a Landman workspace for a fresh visit. `?view=landman` selects it explicitly; `?view=console` restores the original console. A shared scene without an explicit view retains the console. The choice is saved in local storage and the URL.

The left sidebar groups the existing 14 map layers by wells/records, geology/movement, water/infrastructure, and activity/water use. Switches change visibility; layer names enable the layer, zoom to coverage, and open its inspector. Search matches names, sources, categories and coverage labels. Active only filters the list. The RRC archive is searchable separately because most archive rows have no map geometry.

Task presets replace the Landman layer selection and move to the relevant area:

- Overview: Texas wells and USGS basins.
- Water: TexNet injection reporting, pond candidates, NM water facilities and disposal wells.
- Well history: RRC inactive wells and plugging actions.
- Ground movement: Crane OPERA ground motion and reviewed TexNet earthquakes.
- ET fields: Lubbock OpenET pilot, July 2018 initially; choose month and actual ET/reference ETo in the inspector.

Existing panels are mounted into one inspector while Landman is active and returned to their original placement in the full console. Closing the inspector leaves layers visible. Marker selections and source-library actions open the appropriate inspector. The workspace removes tactical overlays and unrelated enabled layers while active; returning to the console restores its visual settings and prior non-Landman layers.

Narrow screens have a Layers toggle and a lower inspector sheet. The 2D / 3D tilt action uses the existing camera control. Map-provider selection, cinematic scenes, drawing, voice and other advanced tools remain in Full console.

This is a UI change over the existing authenticated APIs. No new datasets, refresh schedules, ownership claims or parcel boundaries are introduced. Collection dates and limitations remain visible; land, leases and mineral rights are explicitly marked unconnected.
