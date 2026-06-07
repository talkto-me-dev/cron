#!/usr/bin/env bun

import cdn from "./cdn.js";
import { X509Certificate } from "crypto";
import retry from "@3-/retry";
import Freessl from "@3-/ssl/Freessl.js";
import FREESSL from "../conf/FREESSL.js";
import DOMAIN from "../conf/DOMAIN.js";
import R from "./R.js";
import DNS from "./DNS.js";
import rsync, { runHook } from "./rsync.js";

const NOW = new Date(),
  ssl = Freessl(...FREESSL),
  gen = retry(async (dns, domain) => {
    const r_key = "ssl:" + domain;
    let key_crt = await R.get(r_key),
      renew = 0;

    if (key_crt) {
      key_crt = JSON.parse(key_crt);
      try {
        const expire = new Date(new X509Certificate(key_crt[1]).validTo);
        if ((expire - NOW) / 864e5 > 30) {
          console.log(domain, "expire", expire.toISOString().slice(0, 10));

          /*
            注释掉下面这一行，可以强制重新绑定，添加平台新域名的时候可以用
          */
          return 0;
        } else {
          renew = 1;
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      renew = 1;
    }

    console.log(dns, domain);

    const { set, rm } = await DNS[dns](domain);

    if (renew) {
      const set_done = new Set();
      key_crt = await ssl(
        domain,
        (prefix, val) => {
          if (set_done.has(val)) return;
          set_done.add(val);
          return set("TXT", prefix, val, 60);
        },
        rm,
      );
      await R.set(r_key, JSON.stringify(key_crt), { EX: 7776e3 });
    }
    await rsync(domain, key_crt);
    return key_crt;
  }),
  genAll = async () => {
    let err_count = 0;
    const updates = new Map();
    for (const [dns, domain_li] of Object.entries(DOMAIN)) {
      for (const domain of domain_li) {
        try {
          const key_crt = await gen(dns, domain);
          if (key_crt) updates.set(domain, key_crt);
        } catch (e) {
          ++err_count;
          console.error(dns, domain, e);
        }
      }
    }
    if (updates.size > 0) {
      await runHook();
      await cdn(updates);
    }
    return err_count;
  };

if (import.meta.main) {
  await genAll();
  process.exit();
}
