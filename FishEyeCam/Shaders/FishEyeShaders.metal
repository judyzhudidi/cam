#include <metal_stdlib>
using namespace metal;

// MARK: - Vertex Shader (fullscreen quad)

struct VertexOut {
    float4 position [[position]];
    float2 texCoord;
};

vertex VertexOut vertexShader(uint vertexID [[vertex_id]]) {
    // Fullscreen triangle strip: 4 vertices
    float2 positions[4] = {
        float2(-1, -1),
        float2( 1, -1),
        float2(-1,  1),
        float2( 1,  1)
    };
    float2 texCoords[4] = {
        float2(0, 1),
        float2(1, 1),
        float2(0, 0),
        float2(1, 0)
    };

    VertexOut out;
    out.position = float4(positions[vertexID], 0, 1);
    out.texCoord = texCoords[vertexID];
    return out;
}

// MARK: - Uniform buffer shared with Swift

struct FishEyeUniforms {
    float2 center;      // normalized [0,1] - fisheye center position
    float  radius;      // normalized [0,1] - effect radius
    float  strength;    // distortion strength, e.g. 0.0 ~ 3.0
    float  mode;        // 0 = barrel distortion, 1 = local magnifier (bulge)
    float2 imageSize;   // image dimensions in pixels
    float  aspectRatio; // width / height
};

// MARK: - Fragment Shader: Barrel Distortion (Mode A)
//   r' = r * (1 + k * r^2)
//   Applied globally from the center point

float2 barrelDistort(float2 uv, float2 center, float k, float aspectRatio) {
    float2 delta = uv - center;
    delta.x *= aspectRatio; // correct for aspect ratio

    float r = length(delta);
    float r2 = r * r;
    float distortion = 1.0 + k * r2;
    delta /= distortion;

    delta.x /= aspectRatio;
    return center + delta;
}

// MARK: - Fragment Shader: Local Magnifier / Bulge (Mode B)
//   Only affects pixels within `radius` of `center`
//   Smoothstep falloff for natural blending

float2 bulgeMagnify(float2 uv, float2 center, float radius, float strength, float aspectRatio) {
    float2 delta = uv - center;
    delta.x *= aspectRatio;

    float dist = length(delta);

    if (dist >= radius) {
        return uv; // outside radius, no effect
    }

    // Normalized distance within radius [0, 1]
    float normalizedDist = dist / radius;

    // Bulge formula: shift pixel toward center based on distance
    // Using power curve for smooth distortion
    float bulgeAmount = pow(1.0 - normalizedDist, 2.0) * strength;

    // Move the sampling point toward center (magnification effect)
    float2 direction = normalize(delta);
    float newDist = dist * (1.0 - bulgeAmount);

    float2 result = center;
    if (dist > 0.001) {
        float2 newDelta = direction * newDist;
        newDelta.x /= aspectRatio;
        result = center + newDelta;
    }

    return result;
}

// MARK: - Main Fragment Shader

fragment float4 fishEyeFragment(VertexOut in [[stage_in]],
                                 texture2d<float> inputTexture [[texture(0)]],
                                 constant FishEyeUniforms &uniforms [[buffer(0)]]) {
    constexpr sampler texSampler(mag_filter::linear,
                                  min_filter::linear,
                                  address::clamp_to_edge);

    float2 uv = in.texCoord;
    float2 distortedUV;

    if (uniforms.mode < 0.5) {
        // Mode A: Global barrel distortion
        distortedUV = barrelDistort(uv, uniforms.center, uniforms.strength, uniforms.aspectRatio);
    } else {
        // Mode B: Local magnifier / bulge
        distortedUV = bulgeMagnify(uv, uniforms.center, uniforms.radius, uniforms.strength, uniforms.aspectRatio);
    }

    // Clamp to valid texture range
    distortedUV = clamp(distortedUV, float2(0.0), float2(1.0));

    float4 color = inputTexture.sample(texSampler, distortedUV);

    // Optional: draw a subtle ring indicator for bulge mode
    if (uniforms.mode >= 0.5) {
        float2 delta = uv - uniforms.center;
        delta.x *= uniforms.aspectRatio;
        float dist = length(delta);
        float ringWidth = 0.002;
        float ring = smoothstep(uniforms.radius - ringWidth, uniforms.radius, dist)
                    - smoothstep(uniforms.radius, uniforms.radius + ringWidth, dist);
        color = mix(color, float4(1.0, 1.0, 1.0, 0.6), ring * 0.5);
    }

    return color;
}

// MARK: - Compute kernel for export (render to texture)

kernel void fishEyeCompute(texture2d<float, access::read>  inTexture  [[texture(0)]],
                            texture2d<float, access::write> outTexture [[texture(1)]],
                            constant FishEyeUniforms &uniforms [[buffer(0)]],
                            uint2 gid [[thread_position_in_grid]]) {
    float2 texSize = float2(outTexture.get_width(), outTexture.get_height());
    float2 uv = float2(gid) / texSize;
    float aspectRatio = texSize.x / texSize.y;

    float2 distortedUV;
    if (uniforms.mode < 0.5) {
        distortedUV = barrelDistort(uv, uniforms.center, uniforms.strength, aspectRatio);
    } else {
        distortedUV = bulgeMagnify(uv, uniforms.center, uniforms.radius, uniforms.strength, aspectRatio);
    }

    distortedUV = clamp(distortedUV, float2(0.0), float2(1.0));
    uint2 readCoord = uint2(distortedUV * texSize);
    readCoord = min(readCoord, uint2(texSize) - 1);

    float4 color = inTexture.read(readCoord);
    outTexture.write(color, gid);
}
