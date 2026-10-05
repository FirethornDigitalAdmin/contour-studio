// Contour Studio square holder. mm. Same sockets and keyhole as modular map holders.
$fn=48; tile=140; gap=6; tolerance=.2; seat=4; rim=3;
module tile_shape(){polygon([[70.0, -70.0], [70.0, 70.0], [-70.0, 70.0], [-70.0, -70.0]]);}
module key_shape(){polygon([[-5,-3],[-2,-3],[-1,-1.8],[1,-1.8],[2,-3],[5,-3],[5,3],[2,3],[1,1.8],[-1,1.8],[-2,3],[-5,3]]);}
difference(){
 union(){linear_extrude(seat) offset(delta=gap/2) tile_shape();translate([0,0,seat]) linear_extrude(rim) difference(){offset(delta=gap/2) tile_shape();offset(delta=tolerance/2) tile_shape();}}
translate([0.0,-73.0,-.01]) rotate([0,0,-90.0]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([-73.0,0.0,-.01]) rotate([0,0,180.0]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([0.0,73.0,-.01]) rotate([0,0,90.0]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([73.0,0.0,-.01]) rotate([0,0,0.0]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([0,16.8,-.01]) cylinder(h=2.8,r=3.5);
translate([0,16.8,1]) linear_extrude(1.8) hull(){circle(r=3.5);translate([0,7]) circle(r=3.5);}
translate([0,16.8,-.01]) linear_extrude(1.1) hull(){circle(r=1.8);translate([0,7]) circle(r=1.8);}
}
