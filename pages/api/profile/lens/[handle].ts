import type { NextApiRequest } from "next";
import {
  getSocialMediaLink,
  resolveEipAssetURL,
  resolveHandle,
} from "@/utils/resolver";
import { getLensProfileQuery } from "@/utils/lens";
import {
  LinksItem,
  errorHandle,
  ErrorMessages,
  respondWithCache,
  isValidEthereumAddress,
} from "@/utils/base";
import { PlatformType, PlatformData } from "@/utils/platform";
import { regexEth, regexLens } from "@/utils/regexp";

export const enum LensParamType {
  domain = "domain",
  address = "address",
}

export const config = {
  runtime: "edge",
  regions: ["sfo1", "iad1", "pdx1"],
};
const LensGraphQLEndpoint = "https://api.lens.dev/";

export const getLensProfile = async (handle: string, type: LensParamType) => {
  const query = getLensProfileQuery(type);

  try {
    const payload = {
      query,
      variables: {
        handle,
      },
    };
    const fetchRes = await fetch(LensGraphQLEndpoint, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
    }).then((res) => res.json());
    if (fetchRes.error)
      return {
        error: fetchRes.error,
      };
    if (fetchRes)
      return fetchRes.data?.[
        type === LensParamType.address ? "defaultProfile" : "profile"
      ];
  } catch (e) {
    return null;
  }
};
export const resolveETHFromLens = async (lens: string) => {
  const response = await getLensProfile(lens, LensParamType.domain);
  return response.ownedBy;
};

export const resolveLensResponse = async (handle: string) => {
  let response;
  if (isValidEthereumAddress(handle)) {
    response = await getLensProfile(handle, LensParamType.address);
  } else {
    response = await getLensProfile(handle, LensParamType.domain);
  }
  return response;
};
export const resolveLensHandle = async (handle: string) => {
  const response = await resolveLensResponse(handle);
  if (!response) throw new Error(ErrorMessages.notFound, { cause: 404 });
  if (response.error) throw new Error(response.error, { cause: 500 });
  const pureHandle = response.handle.replaceAll(".lens", "");
  let LINKRES = {};
  if (response.attributes) {
    const linksRecords = response.attributes;
    const linksToFetch = linksRecords.reduce(
      (pre: Array<any>, cur: { key: string }) => {
        if (Object.keys(PlatformData).includes(cur.key)) pre.push(cur.key);
        return pre;
      },
      []
    );

    const getLink = async () => {
      const _linkRes: Partial<Record<string, LinksItem>> = {};
      for (let i = 0; i < linksToFetch.length; i++) {
        const recordText = linksToFetch[i];
        const handle = resolveHandle(
          linksRecords?.find((o: { key: any }) => o.key === recordText)?.value,
          recordText
        );
        if (handle) {
          const resolvedHandle =
            recordText === PlatformType.twitter
              ? handle.replaceAll("@", "")
              : handle;
          _linkRes[recordText] = {
            link: getSocialMediaLink(resolvedHandle, recordText),
            handle: resolvedHandle,
          };
        }
      }
      return _linkRes;
    };
    LINKRES = {
      [PlatformType.hey]: {
        link: getSocialMediaLink(pureHandle, PlatformType.hey),
        handle: pureHandle,
      },
      ...(await getLink()),
    };
  }

  const avatarUri =
    response.picture?.original?.url || response.picture?.uri || null;
  const coverPictureUri =
    response.coverPicture?.original?.url || response.coverPicture?.uri || null;

  const resJSON = {
    address: response.ownedBy?.toLowerCase(),
    identity: response.handle,
    platform: PlatformType.lens,
    displayName: response.name || response.handle,
    avatar: (await resolveEipAssetURL(avatarUri)) || null,
    description: response.bio || null,
    email: null,
    location:
      response.attributes?.find((o: { key: string }) => o.key === "location")
        ?.value || null,
    header: (await resolveEipAssetURL(coverPictureUri)) || null,
    contenthash: null,
    links: LINKRES,
  };
  return resJSON;
};

const resolveLensRespond = async (handle: string) => {
  try {
    const json = await resolveLensHandle(handle);
    return respondWithCache(JSON.stringify(json));
  } catch (e: any) {
    return errorHandle({
      identity: handle,
      platform: PlatformType.lens,
      code: e.cause || 500,
      message: e.message,
    });
  }
};

export default async function handler(req: NextApiRequest) {
  const { searchParams } = new URL(req.url as string);
  const inputName = searchParams.get("handle");
  const lowercaseName = inputName?.toLowerCase() || "";

  if (!regexLens.test(lowercaseName) && !regexEth.test(lowercaseName))
    return errorHandle({
      identity: lowercaseName,
      platform: PlatformType.lens,
      code: 404,
      message: ErrorMessages.invalidIdentity,
    });
  return resolveLensRespond(lowercaseName);
}
