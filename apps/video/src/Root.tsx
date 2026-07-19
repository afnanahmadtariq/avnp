import { Composition } from "remotion";

import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from "./constants";
import { RelayDemo } from "./RelayDemo";
import "./styles.css";

export const RelayVideoRoot = () => (
  <Composition
    component={RelayDemo}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    height={HEIGHT}
    id="RelayDemo"
    width={WIDTH}
  />
);
