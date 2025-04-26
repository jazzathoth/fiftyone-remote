import { deserialize } from "../numpy";
import { RENDER_STATUS_DECODED } from "./shared";

const extractSerializedMask = (
  label: object,
  maskProp: string
): string | undefined => {
  //jazzathoth patch
  console.log(`[extractSerializedMask] got label: ${JSON.stringify(label)}, maskProp: ${maskProp}`);
  if (label[maskProp] == undefined) {
    return undefined;
  } //patch
  if (typeof label?.[maskProp] === "string") {
    return label[maskProp];
  } else if (typeof label?.[maskProp]?.$binary?.base64 === "string") {
    return label[maskProp].$binary.base64;
  }

  return undefined;
};

// // jazzathoth patch
// // original code tries to get mask from sample.mask if it exists
// const extractSerializedMask = (
//   label: any,
//   maskProp: string
// ): string | undefined => {
//   // 1) the “official” field
//   if (typeof label?.[maskProp] === "string") {
//     return label[maskProp];
//   }
//   // 2) legacy BINARY BSON field
//   if (typeof label?.[maskProp]?.$binary?.base64 === "string") {
//     return label[maskProp].$binary.base64;
//   }
//   // 3) fallback to `<maskProp>_path`
//   const alt = `${maskProp}_path`;
//   if (typeof label?.[alt] === "string") {
//     console.log("[extractSerializedMask] used mask_path, label: ", label[alt]);
//     return label[alt];
//   }
//   return undefined;
// };

export const DeserializerFactory = {
  Detection: (label, buffers) => {
    const serializedMask = extractSerializedMask(label, "mask");

    if (serializedMask) {
      const data = deserialize(serializedMask);
      const [height, width] = data.shape;
      label.mask = {
        data,
        image: new ArrayBuffer(width * height * 4),
      };
      buffers.push(data.buffer);
      label._renderStatus = RENDER_STATUS_DECODED;
    }
  },
  Detections: (labels, buffers) => {
    const list = labels?.detections || [];
    for (const label of list) {
      DeserializerFactory.Detection(label, buffers);
    }

    const allLabelsDecoded =
      list.length > 0 &&
      list.every((label) => label._renderStatus === RENDER_STATUS_DECODED);

    if (allLabelsDecoded) {
      labels._renderStatus = RENDER_STATUS_DECODED;
    }
  },
  Heatmap: (label, buffers) => {
    const serializedMask = extractSerializedMask(label, "map");

    if (serializedMask) {
      const data = deserialize(serializedMask);
      const [height, width] = data.shape;

      label.map = {
        data,
        image: new ArrayBuffer(width * height * 4),
      };

      buffers.push(data.buffer);
      label._renderStatus = RENDER_STATUS_DECODED;
    }
  },
  Segmentation: (label, buffers) => {
    const serializedMask = extractSerializedMask(label, "mask");

    if (serializedMask) {
      console.log(`[DeserializerFactory] trying to deserialize: ${serializedMask}`);
      const data = deserialize(serializedMask);
      console.log(`[DeserializerFactory] finished, data: ${data}`)
      const [height, width] = data.shape;

      label.mask = {
        data,
        image: new ArrayBuffer(width * height * 4),
      };

      buffers.push(data.buffer);
      label._renderStatus = RENDER_STATUS_DECODED;
    }
  },
};
