"use strict";

var gl, canvas, program;
var uOffsetLoc, uScaleLoc, uPointSizeLoc, uColorLoc;
var aPositionLoc;

var state = {
    mode: "chaosPoints",
    targetPoints: 5000,
    depth: 4,
    pointSize: 2.0,
    scheme: 0,
    animating: true,
    grown: 0,
    scale: 0.8,
    offset: [0.0, 0.0]
};

var schemes = [
    { bg: [1.00, 1.00, 1.00], fg: [0.05, 0.05, 0.05] },
    { bg: [0.97, 0.98, 1.00], fg: [0.10, 0.30, 0.70] },
    { bg: [1.00, 0.97, 0.93], fg: [0.85, 0.35, 0.10] },
    { bg: [0.96, 1.00, 0.96], fg: [0.10, 0.45, 0.25] }
];

var corners = [
    [-0.9, -0.8],
    [ 0.0,  0.9],
    [ 0.9, -0.8]
];

var MAX_POINTS = 20000;
var chaosPoints = new Float32Array(MAX_POINTS * 2);
var chaosCount = 0;

var subdivTris;
var subdivLines;

var pointsBuf, linesBuf, trisBuf;

function generateChaosPoint() {
    var px = chaosPoints[(chaosCount - 1) * 2];
    var py = chaosPoints[(chaosCount - 1) * 2 + 1];
    var c = corners[Math.floor(Math.random() * 3)];
    chaosPoints[chaosCount * 2    ] = (px + c[0]) / 2;
    chaosPoints[chaosCount * 2 + 1] = (py + c[1]) / 2;
    chaosCount++;
}

function initChaos() {
    chaosPoints[0] = (corners[0][0] + corners[1][0] + corners[2][0]) / 3;
    chaosPoints[1] = (corners[0][1] + corners[1][1] + corners[2][1]) / 3;
    chaosCount = 1;
    state.grown = 0;
}

function subdivide(rootTri, depth) {
    var tris = [rootTri];
    for (var d = 0; d < depth; d++) {
        var next = [];
        for (var i = 0; i < tris.length; i++) {
            var t = tris[i];
            var a = t[0], b = t[1], c = t[2];
            var ab = [(a[0]+b[0])/2, (a[1]+b[1])/2];
            var bc = [(b[0]+c[0])/2, (b[1]+c[1])/2];
            var ca = [(c[0]+a[0])/2, (c[1]+a[1])/2];
            next.push([a, ab, ca], [b, bc, ab], [c, ca, bc]);
        }
        tris = next;
    }
    return tris;
}

function buildSubdivision(depth) {
    var rootTriangle = [corners[0], corners[1], corners[2]];
    var tris = subdivide(rootTriangle, depth);

    var tv = new Float32Array(tris.length * 6);
    var lv = new Float32Array(tris.length * 12);

    for (var i = 0; i < tris.length; i++) {
        var a = tris[i][0], b = tris[i][1], c = tris[i][2];
        tv[i*6]   = a[0]; tv[i*6+1] = a[1];
        tv[i*6+2] = b[0]; tv[i*6+3] = b[1];
        tv[i*6+4] = c[0]; tv[i*6+5] = c[1];

        lv[i*12]    = a[0]; lv[i*12+1]  = a[1];
        lv[i*12+2]  = b[0]; lv[i*12+3]  = b[1];
        lv[i*12+4]  = b[0]; lv[i*12+5]  = b[1];
        lv[i*12+6]  = c[0]; lv[i*12+7]  = c[1];
        lv[i*12+8]  = c[0]; lv[i*12+9]  = c[1];
        lv[i*12+10] = a[0]; lv[i*12+11] = a[1];
    }
    subdivTris  = tv;
    subdivLines = lv;
}

window.onload = function init() {
    canvas = document.getElementById("gl-canvas");
    gl = canvas.getContext("webgl2");
    if (!gl) { alert("WebGL 2.0 isn't available, please use Chrome/Edge/Firefox"); return; }

    program = initShaders(gl, "vertex-shader", "fragment-shader");
    if (!program) { alert("Shader init failed, press F12 to see console errors"); return; }
    gl.useProgram(program);

    uOffsetLoc    = gl.getUniformLocation(program, "uOffset");
    uScaleLoc     = gl.getUniformLocation(program, "uScale");
    uPointSizeLoc = gl.getUniformLocation(program, "uPointSize");
    uColorLoc     = gl.getUniformLocation(program, "uColor");
    aPositionLoc  = gl.getAttribLocation(program, "aPosition");

    pointsBuf = gl.createBuffer();
    linesBuf  = gl.createBuffer();
    trisBuf   = gl.createBuffer();

    initChaos();
    buildSubdivision(state.depth);
    bindUI();
    state.grown = 1;
    requestAnimationFrame(render);
};

var lastTime = 0;
function render(time) {
    var dt = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    if (state.mode === "chaosPoints" && state.animating && state.grown < state.targetPoints) {
        state.grown = Math.min(state.grown + Math.ceil(8000 * dt), state.targetPoints);
    }

    var scheme = schemes[state.scheme];
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(scheme.bg[0], scheme.bg[1], scheme.bg[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform2fv(uOffsetLoc, state.offset);
    gl.uniform1f(uScaleLoc, state.scale);
    gl.uniform1f(uPointSizeLoc, state.pointSize);
    gl.uniform4f(uColorLoc, scheme.fg[0], scheme.fg[1], scheme.fg[2], 1.0);

    if (state.mode === "chaosPoints") {
        var need = Math.min(state.targetPoints, MAX_POINTS);
        while (chaosCount < need) generateChaosPoint();
        var n = Math.min(state.grown, chaosCount);
        if (n > 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, pointsBuf);
            gl.bufferData(gl.ARRAY_BUFFER, chaosPoints.subarray(0, n * 2), gl.DYNAMIC_DRAW);
            setupAttribute();
            gl.drawArrays(gl.POINTS, 0, n);
        }
    } else if (state.mode === "subPoints") {
        gl.bindBuffer(gl.ARRAY_BUFFER, trisBuf);
        gl.bufferData(gl.ARRAY_BUFFER, subdivTris, gl.STATIC_DRAW);
        setupAttribute();
        gl.drawArrays(gl.POINTS, 0, subdivTris.length / 2);
    } else if (state.mode === "subWireframe") {
        gl.bindBuffer(gl.ARRAY_BUFFER, linesBuf);
        gl.bufferData(gl.ARRAY_BUFFER, subdivLines, gl.STATIC_DRAW);
        setupAttribute();
        gl.drawArrays(gl.LINES, 0, subdivLines.length / 2);
    } else if (state.mode === "subSolid") {
        gl.bindBuffer(gl.ARRAY_BUFFER, trisBuf);
        gl.bufferData(gl.ARRAY_BUFFER, subdivTris, gl.STATIC_DRAW);
        setupAttribute();
        gl.drawArrays(gl.TRIANGLES, 0, subdivTris.length / 2);
    }

    requestAnimationFrame(render);
}

function setupAttribute() {
    gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aPositionLoc);
}

function bindUI() {
    var radios = document.getElementsByName("mode");
    for (var i = 0; i < radios.length; i++) {
        radios[i].addEventListener("change", function() {
            state.mode = this.value;
            if (state.mode === "chaosPoints" && state.grown === 0) state.grown = 1;
        });
    }

    document.getElementById("numPoints").addEventListener("input", function(e) {
        state.targetPoints = parseInt(e.target.value);
        document.getElementById("numVal").textContent = e.target.value;
        if (state.targetPoints < state.grown) state.grown = 0;
    });

    document.getElementById("depth").addEventListener("input", function(e) {
        state.depth = parseInt(e.target.value);
        document.getElementById("depthVal").textContent = e.target.value;
        buildSubdivision(state.depth);
    });

    document.getElementById("pointSize").addEventListener("input", function(e) {
        state.pointSize = parseFloat(e.target.value);
        document.getElementById("sizeVal").textContent = e.target.value;
    });

    document.getElementById("scheme").addEventListener("change", function(e) {
        state.scheme = parseInt(e.target.value);
    });

    bindMouse();
    bindKeyboard();
}

var dragging = false, lastMouse = null;

function mouseToNDC(e) {
    var rect = canvas.getBoundingClientRect();
    var x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    var y = 1 - ((e.clientY - rect.top) / rect.height) * 2;
    return [x, y];
}

function bindMouse() {
    canvas.addEventListener("mousedown", function(e) {
        if (e.button !== 0) return;
        dragging = true;
        lastMouse = mouseToNDC(e);
    });

    window.addEventListener("mousemove", function(e) {
        if (!dragging) return;
        var cur = mouseToNDC(e);
        state.offset[0] += cur[0] - lastMouse[0];
        state.offset[1] += cur[1] - lastMouse[1];
        lastMouse = cur;
    });

    window.addEventListener("mouseup", function() { dragging = false; });

    canvas.addEventListener("wheel", function(e) {
        e.preventDefault();
        var cursor = mouseToNDC(e);
        var factor = e.deltaY < 0 ? 1.1 : 1.0 / 1.1;
        var newScale = Math.min(Math.max(state.scale * factor, 0.1), 20);

        var wx = (cursor[0] - state.offset[0]) / state.scale;
        var wy = (cursor[1] - state.offset[1]) / state.scale;
        state.offset[0] = cursor[0] - wx * newScale;
        state.offset[1] = cursor[1] - wy * newScale;
        state.scale = newScale;
    }, {passive: false});
}

function bindKeyboard() {
    window.addEventListener("keydown", function(e) {
        if (e.code === "Space") {
            e.preventDefault();
            state.animating = !state.animating;
        } else if (e.key === "1") {
            setMode("chaosPoints");
        } else if (e.key === "2") {
            setMode("subWireframe");
        } else if (e.key === "3") {
            setMode("subSolid");
        }
    });
}

function setMode(m) {
    state.mode = m;
    var radio = document.querySelector('input[name="mode"][value="' + m + '"]');
    if (radio) radio.checked = true;
    if (m === "chaosPoints" && state.grown === 0) state.grown = 1;
}

function initShaders(gl, vertId, fragId) {
    function compile(type, rawSrc) {
        var src = rawSrc.trim();
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error("Shader compile error:", gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }

    var vsrc = document.getElementById(vertId).textContent;
    var fsrc = document.getElementById(fragId).textContent;

    var vshader = compile(gl.VERTEX_SHADER, vsrc);
    var fshader = compile(gl.FRAGMENT_SHADER, fsrc);
    if (!vshader || !fshader) {
        console.error("Shader compilation failed");
        return null;
    }

    var prog = gl.createProgram();
    gl.attachShader(prog, vshader);
    gl.attachShader(prog, fshader);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error("Program link error:", gl.getProgramInfoLog(prog));
        return null;
    }
    return prog;
}
