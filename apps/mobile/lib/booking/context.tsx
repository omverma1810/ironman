import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from "react";
import { loadServiceArea } from "../prefs";
import { bookingReducer, initialBooking, type BookingAction, type BookingState } from "./state";

type BookingContextValue = { state: BookingState; dispatch: Dispatch<BookingAction> };

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(bookingReducer, initialBooking);

  // A returning customer's area is remembered, so the first step starts
  // already filled in.
  useEffect(() => {
    let cancelled = false;
    loadServiceArea().then((area) => {
      if (area && !cancelled) dispatch({ type: "area", area });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <BookingContext.Provider value={{ state, dispatch }}>{children}</BookingContext.Provider>;
}

export function useBooking(): BookingContextValue {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be used within a BookingProvider");
  return ctx;
}
