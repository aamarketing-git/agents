import React from 'react';
import {Composition} from 'remotion';
import {Reel, ReelProps} from './Reel';

const defaults: ReelProps = {
  frames: 1542,
  segs: [],
  baseY: {},
  baseVideo: 'base_clean.mp4',
};

export const Root: React.FC = () => (
  <Composition
    id="Reel"
    component={Reel}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={defaults.frames}
    defaultProps={defaults}
    calculateMetadata={({props}) => ({durationInFrames: props.frames})}
  />
);
