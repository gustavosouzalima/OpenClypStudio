import { ScrollArea } from "@/editor_runtime/components/ui/scroll-area";
import { IAudio, ITrackItem } from "@designcombo/types";
import Volume from "./common/volume";
import Speed from "./common/speed";
import React, { useState } from "react";
import { dispatch } from "@designcombo/events";
import { EDIT_OBJECT, LAYER_CLONE } from "@designcombo/state";
import { Button } from "@/editor_runtime/components/ui/button";
import { Label } from "@/editor_runtime/components/ui/label";

const BasicAudio = ({
  trackItem,
  type
}: {
  trackItem: ITrackItem & IAudio;
  type?: string;
}) => {
  const showAll = !type;
  const [properties, setProperties] = useState(trackItem);
  const isMuted = Boolean((properties as ITrackItem & { muted?: boolean }).muted);
  const isHidden = Boolean((properties as ITrackItem & { hidden?: boolean }).hidden);

  const handleChangeVolume = (v: number) => {
    dispatch(EDIT_OBJECT, {
      payload: {
        [trackItem.id]: {
          details: {
            volume: v
          }
        }
      }
    });

    setProperties((prev) => {
      return {
        ...prev,
        details: {
          ...prev.details,
          volume: v
        }
      };
    });
  };

  const handleChangeSpeed = (v: number) => {
    dispatch(EDIT_OBJECT, {
      payload: {
        [trackItem.id]: {
          playbackRate: v
        }
      }
    });

    setProperties((prev) => {
      return {
        ...prev,
        playbackRate: v
      };
    });
  };

  const handleToggleMuted = () => {
    const nextMuted = !isMuted;
    dispatch(EDIT_OBJECT, {
      payload: {
        [trackItem.id]: {
          muted: nextMuted
        }
      }
    });
    setProperties((prev) => ({
      ...prev,
      muted: nextMuted
    }));
  };

  const handleToggleHidden = () => {
    const nextHidden = !isHidden;
    dispatch(EDIT_OBJECT, {
      payload: {
        [trackItem.id]: {
          hidden: nextHidden
        }
      }
    });
    setProperties((prev) => ({
      ...prev,
      hidden: nextHidden
    }));
  };

  const handleDuplicate = () => {
    dispatch(LAYER_CLONE);
  };

  const components = [
    {
      key: "quick-actions",
      component: (
        <div className="flex flex-col gap-2">
          <Label className="font-sans text-xs font-semibold">Quick Actions</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={handleDuplicate}>
              Duplicate
            </Button>
            <Button variant="secondary" onClick={handleToggleMuted}>
              {isMuted ? "Unmute" : "Mute"}
            </Button>
            <Button variant="secondary" onClick={handleToggleHidden}>
              {isHidden ? "Show Clip" : "Hide Clip"}
            </Button>
          </div>
        </div>
      )
    },
    {
      key: "speed",
      component: (
        <Speed
          value={properties.playbackRate ?? 1}
          onChange={handleChangeSpeed}
        />
      )
    },
    {
      key: "volume",
      component: (
        <Volume
          onChange={(v: number) => handleChangeVolume(v)}
          value={properties.details.volume ?? 100}
        />
      )
    }
  ];

  return (
    <div className="flex flex-1 flex-col">
      <ScrollArea className="h-full">
        <div className="flex flex-col gap-2 px-4 py-4">
          {components
            .filter((comp) => showAll || comp.key === type)
            .map((comp) => (
              <React.Fragment key={comp.key}>{comp.component}</React.Fragment>
            ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default BasicAudio;
