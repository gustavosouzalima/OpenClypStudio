import React, { useEffect, useState } from "react";
import {
  IAudio,
  ICaption,
  IImage,
  IText,
  ITrackItem,
  ITrackItemAndDetails,
  IVideo
} from "@designcombo/types";
import BasicText from "./basic-text";
import BasicImage from "./basic-image";
import BasicVideo from "./basic-video";
import BasicAudio from "./basic-audio";
import BasicCaption from "./basic-caption";
import { MenuItem } from "../menu-item";
import useStore from "../store/use-store";
import useLayoutStore from "../store/use-layout-store";

const ActiveControlItem = ({
  trackItem
}: {
  trackItem?: ITrackItemAndDetails;
}) => {
  if (!trackItem) {
    return null;
  }
  return (
    <>
      {
        {
          text: <BasicText trackItem={trackItem as ITrackItem & IText} />,
          caption: (
            <BasicCaption trackItem={trackItem as ITrackItem & ICaption} />
          ),
          image: <BasicImage trackItem={trackItem as ITrackItem & IImage} />,
          video: <BasicVideo trackItem={trackItem as ITrackItem & IVideo} />,
          audio: <BasicAudio trackItem={trackItem as ITrackItem & IAudio} />
        }[trackItem.type as "text"]
      }
    </>
  );
};

export const ControlItem = () => {
  return <ControlItemContent mode="sidebar" />;
};

export const ControlItemContent = ({
  mode = "sidebar"
}: {
  mode?: "sidebar" | "inspector";
}) => {
  const { activeIds, trackItemsMap, transitionsMap } = useStore();
  const [trackItem, setTrackItem] = useState<ITrackItem | null>(null);
  const {
    setTrackItem: setLayoutTrackItem,
    showMenuItem,
    activeMenuItem
  } = useLayoutStore();

  useEffect(() => {
    if (activeIds.length === 1) {
      const [id] = activeIds;
      const item = trackItemsMap[id];
      if (item) {
        setTrackItem(item);
        setLayoutTrackItem(item);
      } else {
        console.log(transitionsMap[id]);
        setTrackItem(null);
        setLayoutTrackItem(null);
      }
    } else {
      setTrackItem(null);
      setLayoutTrackItem(null);
    }
  }, [activeIds, trackItemsMap, transitionsMap, setLayoutTrackItem]);

  if (mode === "sidebar" && showMenuItem && activeMenuItem) {
    return <MenuItem />;
  }

  if (!trackItem) {
    if (mode === "sidebar") {
      return <MenuItem />;
    }
    return null;
  }

  return (
    <div className="w-full h-full min-w-0 bg-transparent block">
      <ActiveControlItem trackItem={trackItem} />
    </div>
  );
};
