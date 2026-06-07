#!/usr/bin/env bun

// import Hw from "@3-/hwdns";
// import HW from "../conf/HW.js";
import Cf from "@3-/cf";
import Zone from "@3-/cf/Zone.js";
import { CF_KEY, CF_MAIL } from "../conf/CF.js";

const CF = Cf(CF_KEY, CF_MAIL);

export default {
  // hw: Hw(...HW),
  cf: (domain) => Zone(CF, domain),
};
