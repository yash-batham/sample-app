import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "../context/SocketContext";

export function useSocketInvalidate(events: string[], queryKeys: unknown[][]) {
  const socket = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    function handler() {
      queryKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    }
    events.forEach((event) => socket.on(event, handler));
    return () => {
      events.forEach((event) => socket.off(event, handler));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, queryClient, JSON.stringify(events), JSON.stringify(queryKeys)]);
}
