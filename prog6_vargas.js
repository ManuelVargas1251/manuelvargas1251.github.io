//Manuel Vargas
5-2-17
/*
This program displays a two-segment piecewise cubic planar Bezier curve with continuous tangent vector at every point:  control points P0, P1, P2, and P3 define the first segment, and P3, P4, P5, and P6 define the second segment with P2, P3, and P4 collinear.

User can select and drag any points with left mouse drag
Drag p2 or p4 to see collinearity in action.
*/

"use strict";

//functins are defined wayy below

//setup variables that will be used later
const opt = getQueryParams();
const ctx = document.querySelector("canvas").getContext("2d");
const maxDepth = opt.maxDepth ? parseInt(opt.maxDepth) : 4;
const dotRadius = 5;
const selectRadius = dotRadius * 2;
const selectRadiusSq = selectRadius * selectRadius;
let locked = true	//always true; collinearity
var myzoom = false
var scale = 1	//zoom level

//only 4 colors coloring points
var c_p0 = "#55aad1"
var c_p1 = "#beb048"
var c_p2 = "#55b483"
var c_p3 = "#cd552c"

//p3 color is only on one point
//the rest are reused in reverse order
const colors = [c_p0, c_p1, c_p2, c_p3, c_p2, c_p1, c_p0];

//	x-axis		y-axis
var p0_0 = 180, p0_1 = 90	//p0 and p6
var p1_0 = 150, p1_1 = 70	//p1 and p5
var p2_0 = 25, p2_1 = 70	//p2 and p4

//symmetrical piecewise
let points = [	[-p0_0, p0_1],					//p0
			  	[-p1_0, -p1_1], [-p2_0, -p2_1],	//p1, p2
			  	[   0,   0],					//p3
			  	[  p2_0,  p2_1], [ p1_0, p1_1],	//p4, p5
			  	[ p0_0, -p0_1]					//p6
			 ]

function zoomin(){
	scale = 1
	scale += 0.02
	render(scale)
}

function zoomout(){
	scale = 1
	scale -= 0.02
	render(scale)
}


//render starting with canvas
function render(scale) {
	ctx.scale(scale, scale)	//zoom
	
	
	//resize canvas
	webglUtils.resizeCanvasToDisplaySize(ctx.canvas, window.devicePixelRatio);

	ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
	ctx.save();
	ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
	ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
	
	ctx.strokeStyle = "#21dd21"	//green
	ctx.beginPath()
	
	points.forEach((p, ndx) => {
		ctx[ndx ? 'lineTo' : 'moveTo'](...p);
	})
	
	ctx.stroke()
	//curve properties
	ctx.lineWidth = 4;
	ctx.strokeStyle = "#4BFCBB";	//1st segment
	ctx.beginPath();
	//placing coordinates to canvas
	ctx.moveTo(...points[0]);
	ctx.bezierCurveTo(...points[1], ...points[2], ...points[3]);
	ctx.stroke();
	ctx.strokeStyle = "#5B7CBB";	//2nd segment
	ctx.beginPath();
	ctx.moveTo(...points[3]);
	ctx.bezierCurveTo(...points[4], ...points[5], ...points[6]);
	ctx.stroke();
	ctx.lineWidth = 2;	//circle border width
	
	ctx.font="40px Raleway";	//label text size and font
	//printing names to canvas
	points.forEach((p, ndx) => {
	  ctx.fillStyle = colors[ndx];
	  drawDot(ctx, ...p, dotRadius, true);
	  ctx.fillText('p' + (ndx), p[0] - 15, p[1] - 7);
	});

	ctx.restore();

}
render();	//render point to canvas





let moveNdx = -1;
let moveLastPos;

//select & drag definitions
ctx.canvas.addEventListener('touchstart', e => {
	e.preventDefault();
	onStart(e.touches[0]);
});

ctx.canvas.addEventListener('touchmove', e => {
	onMove(e.touches[0]);
});

ctx.canvas.addEventListener('touchend', e => {
	onEnd(e.touches[0]);
});

//add event listeners for mouse
ctx.canvas.addEventListener('mousedown', onStart);
ctx.canvas.addEventListener('mouseup', onEnd);
ctx.canvas.addEventListener('mousemove', onMove);

function onStart(e) {
	moveLastPos = getRelativeMousePosition(ctx.canvas, e);
	const ndx = getClosestPoint(points, moveLastPos);
	const distSq = v2.distanceSq(points[ndx], moveLastPos);
	moveNdx = (distSq <= selectRadiusSq) ? ndx : -1;
}

function onEnd(e) {
	moveNdx = -1;
}

function onMove(e) {
	if (moveNdx >= 0) {
		const pos = getRelativeMousePosition(ctx.canvas, e)
		const delta = v2.sub(pos, moveLastPos)
		points[moveNdx] = v2.add(points[moveNdx], delta)
		moveLastPos = pos

		if ((moveNdx === 2 || moveNdx === 4) && locked) {
			const otherNdx = moveNdx == 2 ? 4 : 2
			points[otherNdx] = v2.add(points[3], v2.sub(points[3], points[moveNdx]))
		} else if (moveNdx === 3) {
			points[2] = v2.add(points[2], delta)
			points[4] = v2.add(points[4], delta)
		}

		render();
	}
}

function drawDot(ctx, x, y, radius, outline) {
	ctx.globalAlpha = outline ? 0.2 : 0.5;
	ctx.beginPath();
	ctx.arc(x, y, radius, 0, Math.PI * 2, false);
	ctx.fill();
	ctx.globalAlpha = 1	//opacity
	
	if (outline) {
		ctx.strokeStyle = ctx.fillStyle;
		ctx.stroke();
	}
}

function getClosestPoint(points, pos) {
	let ndx = 0;
	let closestDistSq = v2.distanceSq(points[0], pos);
	for (let i = 1; i < points.length; ++i) {
	  const distSq = v2.distanceSq(points[i], pos);

	  if (distSq < closestDistSq) {
		closestDistSq = distSq;
		ndx = i;
	  }
	}
	return ndx;
}

function clamp(v, min, max) {
	return Math.max(Math.min(v, max), min);
}

function getQueryParams() {
	var params = {};
		if (window.location.search) {
		  window.location.search.substring(1).split("&").forEach(function(pair) {
			var keyValue = pair.split("=").map(function (kv) {
			  return decodeURIComponent(kv);
			});
			params[keyValue[0]] = keyValue[1];
		  });
		}
	return params;
}

function getRelativeMousePosition(canvas, e) {
	const rect = canvas.getBoundingClientRect();
	const x = (e.clientX - rect.left) / (rect.right  - rect.left) * canvas.width;
	const y = (e.clientY - rect.top ) / (rect.bottom - rect.top ) * canvas.height;
	return [
	  (x - canvas.width  / 2) / window.devicePixelRatio,
	  (y - canvas.height / 2) / window.devicePixelRatio,
	];
}

const v2 = (function() { 
  // adds 1 or more v2s
  function add(a, ...args) {
    const n = a.slice();
    [...args].forEach(p => {
      n[0] += p[0];
      n[1] += p[1];
    });
    return n;
  }

  function sub(a, ...args) {
    const n = a.slice();
    [...args].forEach(p => {
      n[0] -= p[0];
      n[1] -= p[1];
    });
    return n;
  }

  function mult(a, s) {
    if (Array.isArray(s)) {
      let t = s;
      s = a;
      a = t;
    }
    return [a[0] * s, a[1] * s];
  }

  function lerp(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
    ];
  }

  function distanceSq(a, b) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    return dx * dx + dy * dy;
  }

  return {
    add: add,
    sub: sub,
    mult: mult,
    lerp: lerp,
    distanceSq: distanceSq,
  };
}());
