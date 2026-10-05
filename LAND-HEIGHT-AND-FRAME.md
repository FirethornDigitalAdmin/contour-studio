# Land height and contoured frames

In Style → Land contours, Land height variation keeps 100%, 75% or 50% of the current relief. The custom slider covers 0–100%; 0% makes the ground flat. This multiplies the existing height multiplier before applying smooth, terraced, sculpted or faceted styling. The minimum ground level and feature heights are preserved. Geographic source elevations remain unmodified.

In Style → Frame & caption, Frame contour offers:

- Flat: the existing constant base depth plus frame rise.
- Follow land · minimum height: that selected total is a minimum; higher land lifts the frame.
- Follow land · all edges: the border follows the terrain, subject to the base depth and bevel thickness needed for a solid frame. Frame rise is hidden because it does not apply.

Height above land defaults to 1 mm and can be adjusted from 0.2–5 mm. Clearance is measured at the inner edge; the bevel adds to the highest top surface. A conservative sampling envelope accommodates sharp terrace steps and narrow peaks. Captions follow the actual triangle planes of the border. The underside and separate frame support lip remain flat.

Generate or update the model after editing. The print package reports generated land and frame top height ranges in millimetres. Settings, local drafts, imported designs and saved styles include the new choices. Old designs default to unchanged relief and flat frames. The generated frame is shared by the GLB preview, STL, 3MF and multicolour material exports.

Verification: geometry tests cover all four terrain styles, both contour modes, integrated and separate frames, captions, rounded corners, tile joins, flattening, printer height limits and a multicolour export. Browser checks cover presets, a fully flat custom setting, clearance, persistence, mobile layout and a real exported GLB. Physical print fit remains untested.
