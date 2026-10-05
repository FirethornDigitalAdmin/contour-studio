// Contour Studio hex holder. mm. Same sockets and keyhole as modular map holders.
$fn=48; tile=80; gap=6; tolerance=.2; seat=4; rim=3;
module tile_shape(){polygon([[40.0, 7.105427357601002e-15], [20.0, 34.64101615137755], [-19.999999999999993, 34.64101615137755], [-40.0, 1.4210854715202004e-14], [-20.000000000000018, -34.64101615137753], [20.0, -34.641016151377535]]);}
module key_shape(){polygon([[-5,-3],[-2,-3],[-1,-1.8],[1,-1.8],[2,-3],[5,-3],[5,3],[2,3],[1,1.8],[-1,1.8],[-2,3],[-5,3]]);}
difference(){
 union(){linear_extrude(seat) offset(delta=gap/2) tile_shape();translate([0,0,seat]) linear_extrude(rim) difference(){offset(delta=gap/2) tile_shape();offset(delta=tolerance/2) tile_shape();}}
translate([32.598076211353316,-18.820508075688764,-.01]) rotate([0,0,-29.999999999999993]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([-7.105427357601002e-15,-37.64101615137753,-.01]) rotate([0,0,-90.00000000000001]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([-32.59807621135333,-18.820508075688757,-.01]) rotate([0,0,-150.00000000000003]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([-32.598076211353316,18.82050807568878,-.01]) rotate([0,0,149.99999999999997]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([5.329070518200751e-15,37.64101615137755,-.01]) rotate([0,0,90.0]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([32.598076211353316,18.820508075688778,-.01]) rotate([0,0,30.00000000000001]) linear_extrude(2.1) offset(delta=tolerance) key_shape();
translate([0,9.6,-.01]) cylinder(h=2.8,r=3.5);
translate([0,9.6,1]) linear_extrude(1.8) hull(){circle(r=3.5);translate([0,7]) circle(r=3.5);}
translate([0,9.6,-.01]) linear_extrude(1.1) hull(){circle(r=1.8);translate([0,7]) circle(r=1.8);}
}
