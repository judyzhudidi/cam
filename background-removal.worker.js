import { AutoModel, env, RawImage, Tensor } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/+esm";

const MODEL_ID = "BritishWerewolf/U-2-Netp";

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = "/models/";

const MATTE_BLACK_POINT = 0.12;
const MATTE_WHITE_POINT = 0.78;

let removerPromise = null;

function postProgress(id, phase, progress) {
  self.postMessage({ type: "progress", id, phase, progress });
}

function cleanMatteAlpha(value) {
  const normalized = Math.max(0, Math.min(1, value / 255));
  const clipped = Math.max(
    0,
    Math.min(1, (normalized - MATTE_BLACK_POINT) / (MATTE_WHITE_POINT - MATTE_BLACK_POINT)),
  );
  return clipped * clipped * (3 - 2 * clipped);
}

async function createRemover(id) {
  const model = await AutoModel.from_pretrained(MODEL_ID, {
    device: "wasm",
    dtype: "fp32",
    progress_callback(event) {
      if (event.status === "ready") {
        postProgress(id, "loading", 100);
        return;
      }
      const progress = Number(event.progress);
      if (Number.isFinite(progress)) {
        postProgress(id, "loading", Math.max(0, Math.min(100, progress)));
      }
    },
  });
  postProgress(id, "loading", 100);

  return async function remove(inputBlob) {
    const image = await RawImage.fromBlob(inputBlob);
    const inputSize = 320;
    const scale = Math.min(inputSize / image.width, inputSize / image.height);
    const resizedWidth = Math.max(1, Math.round(image.width * scale));
    const resizedHeight = Math.max(1, Math.round(image.height * scale));
    const left = Math.floor((inputSize - resizedWidth) / 2);
    const right = inputSize - resizedWidth - left;
    const top = Math.floor((inputSize - resizedHeight) / 2);
    const bottom = inputSize - resizedHeight - top;
    const resized = await image.clone().rgb().resize(resizedWidth, resizedHeight);
    const prepared = await resized.pad([left, right, top, bottom]);

    const mean = [0.485, 0.456, 0.406];
    const standardDeviation = [0.229, 0.224, 0.225];
    const planeSize = inputSize * inputSize;
    const normalized = new Float32Array(planeSize * 3);
    for (let pixel = 0; pixel < planeSize; pixel++) {
      for (let channel = 0; channel < 3; channel++) {
        normalized[channel * planeSize + pixel] =
          (prepared.data[pixel * 3 + channel] / 255 - mean[channel]) / standardDeviation[channel];
      }
    }

    const pixelValues = new Tensor("float32", normalized, [1, 3, inputSize, inputSize]);
    const prediction = await model({ "input.1": pixelValues });
    const composite = prediction["1959"] ?? Object.values(prediction)[0];
    if (!composite) throw new Error("The model returned no foreground mask");

    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const value of composite.data) {
      minimum = Math.min(minimum, Number(value));
      maximum = Math.max(maximum, Number(value));
    }
    const range = Math.max(maximum - minimum, 0.00001);
    const maskPixels = new Uint8Array(inputSize * inputSize);
    for (let index = 0; index < maskPixels.length; index++) {
      maskPixels[index] = Math.round(((Number(composite.data[index]) - minimum) / range) * 255);
    }

    const paddedMask = new RawImage(maskPixels, inputSize, inputSize, 1);
    const croppedMask = await paddedMask.crop([
      left,
      top,
      left + resizedWidth - 1,
      top + resizedHeight - 1,
    ]);
    const mask = await croppedMask.resize(image.width, image.height);
    image.rgba();
    for (let index = 0; index < mask.data.length; index++) {
      const cleanedAlpha = cleanMatteAlpha(mask.data[index]);
      const sourceAlpha = image.data[index * 4 + 3] / 255;
      mask.data[index] = Math.round(cleanedAlpha * sourceAlpha * 255);
    }
    return image.putAlpha(mask);
  };
}

self.addEventListener("message", async (event) => {
  const request = event.data;
  if (request.type !== "remove") return;

  try {
    postProgress(request.id, "loading", 0);
    removerPromise ??= createRemover(request.id);
    const remover = await removerPromise;
    postProgress(request.id, "processing");

    const input = new Blob([request.image], { type: request.mimeType || "image/png" });
    const output = await remover(input);
    const pixels = new Uint8ClampedArray(output.data);
    self.postMessage(
      {
        type: "result",
        id: request.id,
        pixels: pixels.buffer,
        width: output.width,
        height: output.height,
      },
      [pixels.buffer],
    );
  } catch (error) {
    removerPromise = null;
    self.postMessage({
      type: "error",
      id: request.id,
      message: error instanceof Error ? error.message : "Background removal failed",
    });
  }
});
