# 003 — GeoNB Contours (10 m / 50 m)

**Publisher:** GeoNB / Service New Brunswick
**Service:** `GeoNB_SNB_Contours` (ArcGIS REST, geonb.snb.ca/arcgis)
**Status:** Wired in 2026-10-18 — viewer overlay only

## What it is

Elevation contour lines for the province: layer 1 at a **10 m** interval
and layer 0 at **50 m**, each line carrying its elevation in the
`Contour` attribute. Note: despite the LiDAR program's ~1 m vertical
quality, GeoNB publishes no 1 m contour product in this service.

## Role (and non-role)

Contours are a *derived view* of the same elevation the LiDAR DTM gives
us directly, so they are NOT a terrain source for the game — heights
come from the DTM sampled onto the game grid, which stays smooth on
flat ground where contour lines sit far apart. Contours earn their keep
as a QA/slope overlay: line spacing shows grade at a glance (tight =
steep), which is handy for spotting the >22% off-axis grades the car
physics dislikes, and for checking DTM-built terrain against the
official lines.
