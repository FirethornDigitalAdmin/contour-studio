// Contour Studio hex holder. mm. Same sockets and keyhole as modular map holders.
$fn=48; tile=140; gap=6; tolerance=.2; seat=4; rim=3;
module tile_shape(){polygon([[70.00000000000001, -1.4210854715202004e-14], [35.000000000000014, 60.62177826491069], [-34.99999999999997, 60.62177826491069], [-69.99999999999999, 0.0], [-35.000000000000014, -60.6217782649107], [35.000000000000014, -60.621778264910716]]);}
module key_shape(){polygon([[-5,-3],[-2,-3],[-1,-1.8],[1,-1.8],[2,-3],[5,-3],[5,3],[2,3],[1,1.8],[-1,1.8],[-2,3],[-5,3]]);}
difference(){
 union(){linear_extrude(seat) offset(delta=gap/2) tile_shape();translate([0,0,seat]) linear_extrude(rim) difference(){offset(delta=gap/2) tile_shape();offset(delta=tolerance/2) tile_shape();}}
translate([55.09807621135334,-31.810889132455365,-.01]) rotate([0,0,-30.000000000000004]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([3.552713678800501e-15,-63.62177826491071,-.01]) rotate([0,0,-90.0]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([-55.098076211353316,-31.81088913245535,-.01]) rotate([0,0,-150.0]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([-55.09807621135329,31.810889132455344,-.01]) rotate([0,0,150.0]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([2.4868995751603507e-14,63.62177826491069,-.01]) rotate([0,0,89.99999999999999]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([55.09807621135334,31.810889132455337,-.01]) rotate([0,0,29.99999999999998]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([0,16.8,-.01]) cylinder(h=2.8,r=3.5);
translate([0,16.8,1]) linear_extrude(1.8) hull(){circle(r=3.5);translate([0,7]) circle(r=3.5);}
translate([0,16.8,-.01]) linear_extrude(1.1) hull(){circle(r=1.8);translate([0,7]) circle(r=1.8);}
}
