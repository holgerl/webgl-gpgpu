window.SS = window.SS || {};
SS.main = SS.main || {};
 
printArray = function(array, dimension) {
    for (var i = 0; i < array.length; i += dimension) {
        var line = i/dimension + ": ";
        for (var j = 0; j < dimension; j++) {
            line += array[i+j] + " ";
        }
         
        line += fromIEEE754Single([array[i], array[i+1], array[i+2], 0]);
        console.log(line);
    }
}
 
SS.main.main = function() {
 
    SS.main.generateTextures();
}

time = function() {
	var lastStart = window.start || new Date();
	window.start = new Date();
	return new Date().getTime() - lastStart.getTime();
}

makeArray = function(resolution, callback) {
	var array = [];
	for (var i = 0; i < resolution*resolution; i++) {
		array.push(callback());
	}
	return array;
}
 
SS.main.generateTextures = function() {
    resolution = 8;
	
    renderer = new THREE.WebGLRenderer();
    renderer.setClearColor(0x000000, 1);
    renderer.setSize(resolution, resolution);
    renderer.domElement.setAttribute('id', 'renderer');
    document.body.appendChild(renderer.domElement);
     
    var texture = new THREE.WebGLRenderTarget(resolution, resolution, {minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBFormat});
     
    var textureCamera = new THREE.OrthographicCamera(-resolution/2, resolution/2, resolution/2, -resolution/2, -100, 100);
    textureCamera.position.z = 10;	
	
	console.log("creating input data ...");
	
	var oslo = [59.913869, 10.752245];

    // Lilehammer: Latitude: 61.115271 | Longitude: 10.466231 (183 km)
    // Trondheim: Latitude: 63.430515 | Longitude: 10.395053 (337 km)
	
	var latInput = makeArray(resolution, function() {return 60 + Math.random()*5;});
	var lonInput = makeArray(resolution, function() {return 10 + Math.random()*1;});
	
	console.log("calculating result on the GPU ...");
	time();
	
    var latMap = createMap(latInput, resolution);
    var lonMap = createMap(lonInput, resolution);
	//var latMap = createMap(function() {return Math.random();}, resolution);
    //var lonMap = createMap(function() {return Math.random();}, resolution);
	
    console.log(" --- LATITUDES:")
    printArray(latMap.image.data, 3);
	console.log(" --- LONGITUDES:")
    printArray(lonMap.image.data, 3);
    
    var textureScene = new THREE.Scene();
    var plane = new THREE.Mesh(
        new THREE.PlaneGeometry(resolution, resolution), 
        new SS.main.textureGeneratorMaterial(latMap, lonMap, oslo)
    );
    plane.position.z = -10;
    textureScene.add(plane);
     
    renderer.render(textureScene, textureCamera, texture, true);
     
	console.log("INTERMEDIATE GPU (" + time() + " ms)");
	 
    var buffer = new Uint8Array(resolution * resolution * 4);
    var gl = renderer.getContext();
    gl.readPixels(0, 0, resolution, resolution, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
     
    console.log(" --- OUTPUT:")
    printArray(buffer, 4);
	
	var count = 0;
	for (var i = 0; i < buffer.length; i += 4) {
		var value = fromIEEE754Single([buffer[i], buffer[i+1], buffer[i+2], 0]);
		if (value <= resolution*resolution*1.5) count++;
	}
	
	console.log("RESULT GPU: " + count + " (" + time() + " ms)");
	
	console.log("calculating result on the CPU ...");
	time();
	
	count = cpuImpl(latInput, lonInput, oslo);
	
	console.log("RESULT CPU: " + count + " (" + time() + " ms)");
}

cpuImpl = function(latInput, lonInput, oslo) {
	var buffer = [];
	
	for (var i in latInput) {
		var lat = latInput[i];
		var lon = lonInput[i];
		
		var total = 0;
		
		for (var j in latInput) {		
			var otherLat = latInput[j];
			var otherLon = lonInput[j];
			
			var diff = [lat - otherLat, lon - otherLon];
			var distance = Math.sqrt(diff[0]*diff[0] + diff[1]*diff[1]);
			
			total += distance;
		}
		
		/*distance = Math.pow(distance, 1.5);
		var foo = 1.0;
		for (var i = 0.0; i < 200.0; i++) {
			foo *= Math.pow(1.01, distance);
		}*/
		
		buffer.push(total);
	}
	
	var count = 0;
	for (var i = 0; i < buffer.length; i++) {
		var value = buffer[i];
		if (value <= resolution*resolution*1.5) count++;
	}
	
	console.log(buffer);
	
	return count;
}
 
SS.main.textureGeneratorMaterial = function(latMap, lonMap, oslo) {
    var vertexShader = "\
        varying vec2 vUv;\
        \
        void main() {\
            vUv = uv;\
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\
        }\
    ";
     
    var fragmentShader = "\
        varying vec2 vUv;\n\
        uniform vec2 oslo;\n\
        uniform float resolution;\n\
        uniform sampler2D latMap;\n\
        uniform sampler2D lonMap;\n\
        " +
		
		/* From http://stackoverflow.com/questions/7059962/how-do-i-convert-a-vec4-rgba-value-to-a-float */
		"vec4 encode32(float f) {\n\
			float e =5.0;\n\
			\
			float F = abs(f); \n\
			float Sign = step(0.0,-f);\n\
			float Exponent = floor(log2(F)); \n\
			float Mantissa = (exp2(- Exponent) * F);\n\
			Exponent = floor(log2(F) + 127.0) + floor(log2(Mantissa));\n\
			vec4 rgba;\n\
			rgba[0] = 128.0 * Sign  + floor(Exponent*exp2(-1.0));\n\
			rgba[1] = 128.0 * mod(Exponent,2.0) + mod(floor(Mantissa*128.0),128.0);  \n\
			rgba[2] = floor(mod(floor(Mantissa*exp2(23.0 -8.0)),exp2(8.0)));\n\
			rgba[3] = floor(exp2(23.0)*mod(Mantissa,exp2(-15.0)));\n\
			return rgba;\n\
		}\n\
		float decode32(vec4 rgba) {\n\
			float Sign = 1.0 - step(128.0,rgba[0])*2.0;\n\
			float Exponent = 2.0 * mod(rgba[0],128.0) + step(128.0,rgba[1]) - 127.0; \n\
			float Mantissa = mod(rgba[1],128.0)*65536.0 + rgba[2]*256.0 +rgba[3] + float(0x800000);\n\
			float Result =  Sign * exp2(Exponent) * (Mantissa * exp2(-23.0 )); \n\
			return Result;\n\
		}\n" +
		/* End exceprt */
        "\
        void main() {\n\
            vec2 vUvInverted = vec2(vUv.x, 1.0-vUv.y);\n\
			\
			vec4 latBytes = texture2D(latMap, vUvInverted)*255.0;\n\
			vec4 lonBytes = texture2D(lonMap, vUvInverted)*255.0;\n\
			\
			float lat = decode32(vec4(latBytes.r, latBytes.g, latBytes.b, 0.0));\n\
            float lon = decode32(vec4(lonBytes.r, lonBytes.g, lonBytes.b, 0.0));\n\
			\
			/*TODO: Convert lat/lon to 3D coordinates to get the real distance*/\
			\
			vec2 coordinates = vec2(lat, lon);\n\
            float distance = 0.0;\n\
			\
			\
			for (float i = 0.5; i < 8.0; i++) {\n\
				for (float j = 0.5; j < 8.0; j++) {\n\
					vec4 otherLatBytes = texture2D(latMap, vec2(i/resolution, 1.0-(j/resolution)))*255.0;\n\
					vec4 otherLonBytes = texture2D(lonMap, vec2(i/resolution, 1.0-(j/resolution)))*255.0;\n\
					\
					float otherLat = decode32(vec4(otherLatBytes.r, otherLatBytes.g, otherLatBytes.b, 0.0));\n\
					float otherLon = decode32(vec4(otherLonBytes.r, otherLonBytes.g, otherLonBytes.b, 0.0));\n\
					\
					vec2 otherCoordinates = vec2(otherLat, otherLon);\n\
					distance += length(otherCoordinates - coordinates);\n\
				}\n\
			}\n\
			\
			\
			\
			vec4 distanceBytes = encode32(distance) / 255.0;\n\
			\
			gl_FragColor = vec4(distanceBytes.x, distanceBytes.y, distanceBytes.z, 1.0);\n\
			\
        }\
    ";
     
    var uniforms = {
        oslo: {type: "2f", value: oslo},
        resolution: {type: "f", value: resolution},
        latMap: {"type": "t", "value": latMap},
        lonMap: {"type": "t", "value": lonMap}
    };
 
    return new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        transparent: true,
        depthWrite: false
    });
}
 
var createMap = function(input, resolution) {
    var map = THREE.ImageUtils.generateDataTexture(resolution, resolution, new THREE.Color(0x000000)); // TODO: Use RGBA texture and 4 byte floats
     
    var width = map.image.width;
    var height = map.image.height;
    var nofPixels = width*height;
 
    for (var i = 0; i < nofPixels; i++) {       
        var x = i%width;
        var y = Math.floor(i/width);
         
        var val = input[i];
         
        var valBytes = toIEEE754Single(val);
         
        map.image.data[i*3] = valBytes[0];
        map.image.data[i*3+1] = valBytes[1];
        map.image.data[i*3+2] = valBytes[2];
    }
     
    map.needsUpdate = true;
    return map;
}