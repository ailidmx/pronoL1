import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase.js";

export const getPronosticsLeaderboard = httpsCallable(functions, "getPronosticsLeaderboard");
