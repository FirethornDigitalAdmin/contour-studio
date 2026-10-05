// Contour Studio hex holder. mm. Same sockets and keyhole as modular map holders.
$fn=48; tile=100; gap=6; tolerance=.2; seat=4; rim=3;
module tile_shape(){polygon([[50.0, -7.105427357601002e-15], [25.0, 43.301270189221924], [-24.999999999999993, 43.30127018922194], [-50.0, 0.0], [-25.00000000000002, -43.301270189221924], [25.0, -43.30127018922194]]);}
module key_shape(){polygon([[-5,-3],[-2,-3],[-1,-1.8],[1,-1.8],[2,-3],[5,-3],[5,3],[2,3],[1,1.8],[-1,1.8],[-2,3],[-5,3]]);}
difference(){
 union(){linear_extrude(seat) offset(delta=gap/2) tile_shape();translate([0,0,seat]) linear_extrude(rim) difference(){offset(delta=gap/2) tile_shape();offset(delta=tolerance/2) tile_shape();}}
translate([40.098076211353316,-23.150635094610973,-.01]) rotate([0,0,-30.00000000000001]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([-7.105427357601002e-15,-46.30127018922193,-.01]) rotate([0,0,-90.00000000000001]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([-40.09807621135333,-23.150635094610962,-.01]) rotate([0,0,-150.0]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([-40.098076211353316,23.15063509461097,-.01]) rotate([0,0,150.0]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([7.105427357601002e-15,46.30127018922193,-.01]) rotate([0,0,90.0]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([40.098076211353316,23.15063509461096,-.01]) rotate([0,0,29.999999999999993]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([0,12.0,-.01]) cylinder(h=2.8,r=3.5);
translate([0,12.0,1]) linear_extrude(1.8) hull(){circle(r=3.5);translate([0,7]) circle(r=3.5);}
translate([0,12.0,-.01]) linear_extrude(1.1) hull(){circle(r=1.8);translate([0,7]) circle(r=1.8);}
}
