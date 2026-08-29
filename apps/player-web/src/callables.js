import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase.js";

export const getPronosticsLeaderboard = httpsCallable(functions, "getPronosticsLeaderboard");
export const getPlayerMatchCenter = httpsCallable(functions, "getPlayerMatchCenter");
export const getQuizCenter = httpsCallable(functions, "getQuizCenter");
export const getCommunities = httpsCallable(functions, "getCommunities");
export const createCommunity = httpsCallable(functions, "createCommunity");
export const joinCommunity = httpsCallable(functions, "joinCommunity");
export const leaveCommunity = httpsCallable(functions, "leaveCommunity");
