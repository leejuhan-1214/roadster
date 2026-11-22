// Metres relative to the tyre contact plane. The sidewalk geometry extends
// underneath the carriageway. Polygon offsets keep the paint legible at distance.
export const CITY_ROAD_LEVELS=Object.freeze({
  tileGround:-.010, coreGround:-.009, landuse:-.007, water:-.006,
  sidewalkJunction:-.004, sidewalk:-.003, asphalt:0, median:.0005,
  junction:.001, lane:.0015, centreLine:.002, busLine:.00225, crossing:.0025,
  tireMark:.0035, contactShadow:.004
});
