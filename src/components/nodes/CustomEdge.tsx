/**
 * CustomEdge: bezier curve colored by source port type.
 */

'use client';

import { memo } from 'react';
import { BezierEdge, type EdgeProps } from '@xyflow/react';

export const CustomEdge = memo(function CustomEdge(props: EdgeProps) {
  return (
    <BezierEdge
      {...props}
      style={{
        stroke: '#4ade80',
        strokeWidth: 2,
        ...props.style,
      }}
    />
  );
});
