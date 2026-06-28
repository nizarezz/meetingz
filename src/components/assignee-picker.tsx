"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { usersApi } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, UserCheck, Mail, UserPlus, X } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

interface AssigneePickerProps {
  value: string;
  onChange: (value: string, userId?: string) => void;
  onInvite: (email: string, name?: string) => void;
}

export function AssigneePicker({ value, onChange, onInvite }: AssigneePickerProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value);
  const [debounced, setDebounced] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInput(value);
  }, [value]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(input), 200);
    return () => clearTimeout(t);
  }, [input]);

  const { data: results, isFetching } = useQuery({
    queryKey: ["users", "search", debounced],
    queryFn: () => usersApi.list({ search: debounced, perPage: 10 }),
    enabled: debounced.length >= 1,
  });

  const users = results?.data ?? [];
  const isEmail = input.includes("@");
  const exactEmailMatch = users.find((u) => u.email === input);
  const exactNameMatch = users.find((u) => u.name?.toLowerCase() === input.toLowerCase());
  const filtered = users.filter((u) => u.email !== value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function select(email: string, userId?: string) {
    onChange(email, userId);
    setInput(email);
    setOpen(false);
  }

  function showActions() {
    if (!debounced) return false;
    if (isEmail && !exactEmailMatch) return true;
    if (!isEmail && !exactNameMatch && debounced.length >= 2) return true;
    return false;
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Input
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Name or email..."
          className="pr-8"
        />
        {input && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => { setInput(""); onChange(""); setOpen(false); }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && debounced && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover p-1 shadow-md">
          {isFetching ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((u) => (
                  <button
                    type="button"
                    key={u.id}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent text-left"
                    onClick={() => select(u.email, u.id)}
                  >
                  <UserCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="font-medium">{u.name ?? u.email}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{u.email}</span>
                </button>
              ))}

              {showActions() && (
                <div className="border-t pt-1.5 mt-1 px-2 pb-1">
                  {isEmail ? (
                    <>
                      <p className="text-xs text-muted-foreground mb-2">
                        &ldquo;{input}&rdquo; is not registered
                      </p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1.5"
                          onClick={() => { onInvite(input); setOpen(false); }}
                        >
                          <UserPlus className="h-3 w-3" /> Invite &amp; assign
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs gap-1.5"
                          onClick={() => { select(input, undefined); }}
                        >
                          <Mail className="h-3 w-3" /> Assign as external
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground py-1">
                      &ldquo;{input}&rdquo; not found — try email
                    </p>
                  )}
                </div>
              )}

              {!isFetching && filtered.length === 0 && !showActions() && (
                <p className="px-2 py-3 text-xs text-muted-foreground text-center">
                  Keep typing to search
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
