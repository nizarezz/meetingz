"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

type ChannelConfig = {
  channel: string;
  table: string;
  events?: ("INSERT" | "UPDATE" | "DELETE" | "*")[];
  filter?: string;
  queryKeys: (string | undefined)[][];
};

export function useRealtimeInvalidation(configs: ChannelConfig[]) {
  const qc = useQueryClient();

  useEffect(() => {
    const channels = configs.map((cfg) => {
      const events = cfg.events ?? ["*"];
      const channel = supabase.channel(cfg.channel);

      events.forEach((event) => {
        channel.on(
          "postgres_changes",
          { event, schema: "public", table: cfg.table, filter: cfg.filter },
          () => {
            cfg.queryKeys.forEach((key) => {
              if (key.every((k) => k !== undefined)) {
                qc.invalidateQueries({ queryKey: key });
              }
            });
          },
        );
      });

      channel.subscribe();
      return channel;
    });

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, JSON.stringify(configs)]);
}
