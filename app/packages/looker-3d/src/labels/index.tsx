import {
  FO_LABEL_TOGGLED_EVENT,
  LabelData,
  LabelToggledEvent,
  Sample,
  selectiveRenderingEventBus,
} from "@fiftyone/looker";
import {
  getLabelColor,
  shouldShowLabelTag,
} from "@fiftyone/looker/src/overlays/util";
import * as fop from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { fieldSchema } from "@fiftyone/state";
import { useOnShiftClickLabel } from "@fiftyone/state/src/hooks/useOnShiftClickLabel";
import { ThreeEvent } from "@react-three/fiber";
import { folder, useControls } from "leva";
import { get as _get } from "lodash";
import { useCallback, useEffect, useMemo } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { PANEL_ORDER_LABELS } from "../constants";
import { usePathFilter } from "../hooks";
import { type Looker3dSettings, defaultPluginSettings } from "../settings";
import { cuboidLabelLineWidthAtom, polylineLabelLineWidthAtom } from "../state";
import { toEulerFromDegreesArray } from "../utils";
import { Cuboid, type CuboidProps } from "./cuboid";
import { type OverlayLabel, load3dOverlays } from "./loader";
import { type PolyLineProps, Polyline } from "./polyline";

export interface ThreeDLabelsProps {
  sampleMap: { [sliceOrFilename: string]: Sample } | fos.Sample[];
}

export const ThreeDLabels = ({ sampleMap }: ThreeDLabelsProps) => {
  const schema = useRecoilValue(fieldSchema({ space: fos.State.SPACE.SAMPLE }));
  const { coloring, selectedLabelTags, customizeColorSetting, labelTagColors } =
    useRecoilValue(fos.lookerOptions({ withFilter: true, modal: true }));

  const settings = fop.usePluginSettings<Looker3dSettings>(
    "3d",
    defaultPluginSettings
  );
  const onSelectLabel = fos.useOnSelectLabel();
  const pathFilter = usePathFilter();
  const colorScheme = useRecoilValue(fos.colorScheme);
  const [cuboidLineWidth, setCuboidLineWidth] = useRecoilState(
    cuboidLabelLineWidthAtom
  );
  const [polylineWidth, setPolylineWidth] = useRecoilState(
    polylineLabelLineWidthAtom
  );
  const selectedLabels = useRecoilValue(fos.selectedLabelMap);
  const tooltip = fos.useTooltip();
  const labelAlpha = colorScheme.opacity;

  const constLabelLevaControls = {
    cuboidLineWidget: {
      value: cuboidLineWidth,
      min: 0,
      max: 20,
      step: 1,
      label: `Cuboid Line Width`,
      onChange: (value: number) => {
        setCuboidLineWidth(value);
      },
    },
    polylineLineWidget: {
      value: polylineWidth,
      min: 0,
      max: 20,
      step: 1,
      label: `Polyline Line Width`,
      onChange: (value: number) => {
        setPolylineWidth(value);
      },
    },
  };

  const [labelConfig] = useControls(
    () => ({
      Labels: folder(constLabelLevaControls, {
        order: PANEL_ORDER_LABELS,
        collapsed: true,
      }),
    }),
    [setCuboidLineWidth, setPolylineWidth]
  );

  const handleSelect = useCallback(
    (label: OverlayLabel, e: ThreeEvent<MouseEvent>) => {
      onSelectLabel({
        detail: {
          id: label._id,
          field: label.path,
          sampleId: label.sampleId,
          instanceId: label.instance?._id,
          isShiftPressed: e.shiftKey,
        },
      });
    },
    [onSelectLabel]
  );

  const [overlayRotation, itemRotation] = useMemo(
    () => [
      toEulerFromDegreesArray(_get(settings, "overlay.rotation", [0, 0, 0])),
      toEulerFromDegreesArray(
        _get(settings, "overlay.itemRotation", [0, 0, 0])
      ),
    ],
    [settings]
  );

  const canonicalSampleId = useMemo(() => {
    const samples = Array.isArray(sampleMap)
      ? sampleMap
      : Object.values(sampleMap);
    return samples[0].id ?? samples[0].sample?._id;
  }, [sampleMap]);

  const rawOverlays = useMemo(
    () =>
      load3dOverlays(sampleMap, selectedLabels, [], schema)
        .map((l) => {
          const path = l.path;
          const isTagged = shouldShowLabelTag(selectedLabelTags, l.tags);
          const color = getLabelColor({
            coloring,
            path,
            isTagged,
            labelTagColors,
            customizeColorSetting,
            label: l,
            embeddedDocType: l._cls,
          });

          return { ...l, color, id: l._id };
        })
        .filter((l) => pathFilter(l.path, l)),
    [
      coloring,
      pathFilter,
      sampleMap,
      selectedLabels,
      schema,
      selectedLabelTags,
      labelTagColors,
      customizeColorSetting,
    ]
  );
  const [cuboidOverlays, polylineOverlays] = useMemo(() => {
    const newCuboidOverlays = [];
    const newPolylineOverlays = [];

    for (const overlay of rawOverlays) {
      if (
        overlay._cls === "Detection" &&
        overlay.dimensions &&
        overlay.location
      ) {
        newCuboidOverlays.push(
          <Cuboid
            key={`cuboid-${overlay.id ?? overlay._id}-${overlay.sampleId}`}
            rotation={overlayRotation}
            itemRotation={itemRotation}
            opacity={labelAlpha}
            {...(overlay as unknown as CuboidProps)}
            onClick={(e) => handleSelect(overlay, e)}
            label={overlay}
            tooltip={tooltip}
            useLegacyCoordinates={settings.useLegacyCoordinates}
          />
        );
      } else if (
        overlay._cls === "Polyline" &&
        (overlay as unknown as PolyLineProps).points3d
      ) {
        newPolylineOverlays.push(
          <Polyline
            key={`polyline-${overlay._id ?? overlay.id}-${overlay.sampleId}`}
            rotation={overlayRotation}
            opacity={labelAlpha}
            {...(overlay as unknown as PolyLineProps)}
            label={overlay}
            onClick={(e) => handleSelect(overlay, e)}
            tooltip={tooltip}
          />
        );
      }
    }
    return [newCuboidOverlays, newPolylineOverlays];
  }, [
    rawOverlays,
    itemRotation,
    labelAlpha,
    overlayRotation,
    handleSelect,
    tooltip,
    settings,
  ]);

  const getOnShiftClickLabelCallback = useOnShiftClickLabel();

  useEffect(() => {
    const unsub = selectiveRenderingEventBus.on(
      FO_LABEL_TOGGLED_EVENT,
      (e: LabelToggledEvent) => {
        getOnShiftClickLabelCallback(e);
      }
    );

    return () => {
      unsub();
    };
  }, [getOnShiftClickLabelCallback]);

  return (
    <group>
      <mesh rotation={overlayRotation}>{cuboidOverlays}</mesh>
      {polylineOverlays}
    </group>
  );
};
