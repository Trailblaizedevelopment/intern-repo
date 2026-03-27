declare module 'react-simple-maps' {
  import * as React from 'react';

  export interface ComposableMapProps {
    projection?: string;
    projectionConfig?: Record<string, unknown>;
    width?: number;
    height?: number;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }
  export const ComposableMap: React.FC<ComposableMapProps>;

  export interface GeographiesProps {
    geography: string | Record<string, unknown>;
    children: (props: { geographies: unknown[] }) => React.ReactNode;
  }
  export const Geographies: React.FC<GeographiesProps>;

  export interface GeographyProps {
    geography: unknown;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: {
      default?: React.CSSProperties;
      hover?: React.CSSProperties;
      pressed?: React.CSSProperties;
    };
    onClick?: () => void;
  }
  export const Geography: React.FC<GeographyProps>;

  export interface MarkerProps {
    coordinates: [number, number];
    onClick?: () => void;
    children?: React.ReactNode;
  }
  export const Marker: React.FC<MarkerProps>;

  export interface ZoomableGroupProps {
    center?: [number, number];
    zoom?: number;
    children?: React.ReactNode;
  }
  export const ZoomableGroup: React.FC<ZoomableGroupProps>;
}
