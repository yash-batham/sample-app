import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { API_BASE_URL } from "../api/client";

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  if (!socketRef.current) {
    socketRef.current = io(API_BASE_URL, { transports: ["websocket", "polling"] });
  }

  useEffect(() => {
    const socket = socketRef.current!;

    function handleConnect() {
      queryClient.invalidateQueries();
    }

    socket.on("connect", handleConnect);
    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off("connect", handleConnect);
    };
  }, [queryClient]);

  return <SocketContext.Provider value={socketRef.current}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within SocketProvider");
  return ctx;
}
