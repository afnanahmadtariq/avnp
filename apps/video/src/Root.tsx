import { Composition } from "remotion";

import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from "./constants";
import { RelayDemo } from "./RelayDemo";
import { RelayTech } from "./RelayTech";
import { TECH_TOTAL_FRAMES } from "./tech/constants";
import "./styles.css";
import "./tech-styles.css";

export const RelayVideoRoot = () => (
  <>
    <Composition
      component={RelayDemo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      height={HEIGHT}
      id="RelayDemo"
      width={WIDTH}
    />
    <Composition
      component={RelayTech}
      durationInFrames={TECH_TOTAL_FRAMES}
      fps={FPS}
      height={HEIGHT}
      id="RelayTech"
      width={WIDTH}
    />
  </>
);
