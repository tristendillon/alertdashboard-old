"use client";

import { api } from "@sizeupdashboard/convex/src/api/_generated/api.js";
import React, { useEffect } from "react";
import { AdvancedMarker } from "@vis.gl/react-google-maps";
import Image from "next/image";
import { useBounds } from "@/hooks/use-bounds";
import type { LatLngBounds } from "@/lib/types";
import { getFlowRateColor } from "@/utils/icons";
import { usePaginatedQuery } from "convex/react";

interface HydrantsRendererProps {
  mapId: string;
}

export function HydrantsRenderer({ mapId }: HydrantsRendererProps) {
  const mapBounds = useBounds(mapId);

  if (!mapBounds) {
    return null;
  }

  return <Hydrants {...mapBounds} />;
}

const Hydrants = (bounds: LatLngBounds) => {
  const { status, results, loadMore } = usePaginatedQuery(
    api.hydrants.getHydrantsByBounds,
    {
      // Corner convention (must match getHydrantsByBounds in
      // apps/convex/src/api/hydrants.ts, which builds its S2 rectangle as
      // `{ west: topLeft.longitude, south: topLeft.latitude,
      //    east: bottomRight.longitude, north: bottomRight.latitude }`):
      //   topLeft     = south-west corner (min latitude, min longitude)
      //   bottomRight = north-east corner (max latitude, max longitude)
      // Sending them the other way round yields west > east, an inverted
      // longitude interval that matches everything *outside* the viewport,
      // so no hydrants ever render.
      topLeft: {
        latitude: bounds.south,
        longitude: bounds.west,
      },
      bottomRight: {
        latitude: bounds.north,
        longitude: bounds.east,
      },
    },
    {
      initialNumItems: 100,
    },
  );

  useEffect(() => {
    if (status === "CanLoadMore") {
      void loadMore(100);
    }
  }, [status, loadMore]);

  if (status === "LoadingFirstPage" || status === "LoadingMore") {
    return null;
  }

  const hydrantsWithIcons = results.map((hydrant) => ({
    ...hydrant,
    icon: `/icons/hydrants/hydrant-${getFlowRateColor(Number(hydrant.calculatedFlowRate))}.png`,
  }));
  return (
    <React.Fragment>
      {hydrantsWithIcons.map((hydrant) => (
        <AdvancedMarker
          key={hydrant._id}
          position={{
            lat: hydrant.location.latitude,
            lng: hydrant.location.longitude,
          }}
        >
          <Image src={hydrant.icon} alt="hydrant" width={40} height={40} />
        </AdvancedMarker>
      ))}
    </React.Fragment>
  );
};
