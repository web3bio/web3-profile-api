import { formatText, isWeb3Address, prettify } from "@/utils/base";
import {
  IDENTITY_GRAPH_SERVER,
  generateProfileStruct,
} from "../[handle]/utils";
import { BATCH_GET_PROFILES } from "@/utils/query";
import {
  AuthHeaders,
  ErrorMessages,
  ProfileAPIResponse,
  ProfileNSResponse,
} from "@/utils/types";
import { PlatformType } from "@/utils/platform";

const SUPPORTED_PLATFORMS = [
  PlatformType.ens,
  PlatformType.ethereum,
  PlatformType.farcaster,
  PlatformType.lens,
  PlatformType.basenames,
];

export async function fetchIdentityGraphBatch(
  ids: string[],
  ns: boolean,
  headers: AuthHeaders,
): Promise<
  ProfileAPIResponse[] | ProfileNSResponse[] | { error: { message: string } }
> {
  try {
    const response = await fetch(IDENTITY_GRAPH_SERVER, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: BATCH_GET_PROFILES,
        variables: {
          ids: ids,
        },
      }),
    });

    const json = await response.json();
    if (json.code) return json;
    let res = [] as any;
    if (json?.data?.identities?.length > 0) {
      for (let i = 0; i < json.data.identities.length; i++) {
        const item = json.data.identities[i];
        if (item) {
          res.push({
            ...(await generateProfileStruct(
              item.profile || {
                platform: item.platform,
                address: item.identity,
                identity: item.identity,
                displayName: isWeb3Address(item.identity)
                  ? formatText(item.identity)
                  : item.identity,
              },
              ns,
            )),
            aliases: item.aliases,
          });
        }
      }
    }
    return res;
  } catch (e: any) {
    throw new Error(ErrorMessages.notFound, { cause: 404 });
  }
}

export const filterIds = (ids: string[]) => {
  const resolved = ids
    .map((x) => {
      if (
        !x.includes(",") &&
        (x.endsWith(".base") || x.endsWith(".base.eth"))
      ) {
        return `${PlatformType.basenames},${prettify(x)}`;
      }
      if (!x.includes(",") && x.endsWith(".farcaster")) {
        return `${PlatformType.farcaster},${prettify(x)}`;
      }
      return x;
    })
    .filter(
      (x) =>
        !!x && SUPPORTED_PLATFORMS.includes(x.split(",")[0] as PlatformType),
    );
  return resolved;
};
