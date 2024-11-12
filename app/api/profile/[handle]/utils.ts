import {
  PLATFORMS_TO_EXCLUDE,
  errorHandle,
  formatText,
  isValidEthereumAddress,
  prettify,
  respondWithCache,
} from "@/utils/base";
import { PLATFORM_DATA, PlatformType } from "@/utils/platform";
import {
  GET_PROFILES,
  primaryDomainResolvedRequestArray,
  queryIdentityGraph,
} from "@/utils/query";
import {
  getSocialMediaLink,
  resolveEipAssetURL,
  resolveHandle,
} from "@/utils/resolver";
import {
  ErrorMessages,
  IdentityGraphEdge,
  ProfileAPIResponse,
  ProfileNSResponse,
  ProfileRecord,
} from "@/utils/types";
import { regexTwitterLink } from "@/utils/regexp";
import { UDSocialAccountsList } from "../unstoppabledomains/[handle]/utils";
import { recordsShouldFetch } from "../sns/[handle]/utils";

export const NEXTID_GRAPHQL_ENDPOINT =
  process.env.NEXT_PUBLIC_GRAPHQL_SERVER || "https://graph.web3.bio/graphql";

function generateSocialLinks(data: ProfileRecord, edges?: IdentityGraphEdge[]) {
  const platform = data.platform;
  const texts = data.texts;
  const keys = texts ? Object.keys(texts) : [];
  const identity = data.identity;
  const res = {} as any;
  switch (platform) {
    case PlatformType.basenames:
    case PlatformType.ethereum:
    case PlatformType.ens:
      if (!texts) return {};
      let key = null;
      keys.forEach((i) => {
        key = Array.from(PLATFORM_DATA.keys()).find((k) =>
          PLATFORM_DATA.get(k)?.ensText?.includes(i.toLowerCase())
        );
        if (key && texts[i]) {
          res[key] = {
            link: getSocialMediaLink(texts[i], key),
            handle: resolveHandle(texts[i], key),
            sources: resolveVerifiedLink(`${key},${texts[i]}`, edges),
          };
        }
      });
      break;
    case PlatformType.farcaster:
      const resolvedHandle = resolveHandle(identity);
      res[PlatformType.farcaster] = {
        links: getSocialMediaLink(resolvedHandle!, PlatformType.farcaster),
        handle: resolvedHandle,
        sources: resolveVerifiedLink(
          `${PlatformType.farcaster},${resolvedHandle}`,
          edges
        ),
      };
      if (!data.description) break;
      const twitterMatch = data.description?.match(regexTwitterLink);
      if (twitterMatch) {
        const matched = twitterMatch[1];
        const resolveMatch =
          resolveHandle(matched, PlatformType.farcaster) || "";
        res[PlatformType.twitter] = {
          link: getSocialMediaLink(resolveMatch, PlatformType.twitter),
          handle: resolveMatch,
          sources: resolveVerifiedLink(
            `${PlatformType.twitter},${resolveMatch}`,
            edges
          ),
        };
      }
      break;
    case PlatformType.lens:
      const pureHandle = identity.replace(".lens", "");
      res[PlatformType.lens] = {
        links: getSocialMediaLink(pureHandle!, PlatformType.lens),
        handle: pureHandle,
        sources: resolveVerifiedLink(
          `${PlatformType.lens},${pureHandle}.lens`,
          edges
        ),
      };
      keys?.forEach((i) => {
        if (Array.from(PLATFORM_DATA.keys()).includes(i as PlatformType)) {
          let key = null;
          key = Array.from(PLATFORM_DATA.keys()).find(
            (k) => k === i.toLowerCase()
          );
          if (key) {
            const resolvedHandle = resolveHandle(texts[i], i as PlatformType);
            res[key] = {
              link: getSocialMediaLink(texts[i], i),
              handle: resolvedHandle,
              sources: resolveVerifiedLink(`${key},${resolvedHandle}`, edges),
            };
          }
        }
      });
      break;

    // // todo: remain to do
    // case PlatformType.dotbit:
    //   break;
    case PlatformType.sns:
      recordsShouldFetch.forEach((x) => {
        const handle = resolveHandle(texts?.[x]);
        if (handle) {
          const type = ["CNAME", PlatformType.url].includes(x)
            ? PlatformType.website
            : x;
          res[type] = {
            link: getSocialMediaLink(handle, type)!,
            handle: handle,
            sources: resolveVerifiedLink(`${type},${handle}`, edges),
          };
        }
      });
      break;
    // case PlatformType.solana:
    //   break;
    case PlatformType.unstoppableDomains:
      UDSocialAccountsList.forEach((x) => {
        const item = texts?.[x];
        if (item && PLATFORM_DATA.get(x)) {
          const resolvedHandle = resolveHandle(item, x);
          res[x] = {
            link: getSocialMediaLink(resolvedHandle, x),
            handle: resolvedHandle,
            sources: resolveVerifiedLink(`${x},${resolvedHandle}`, edges),
          };
        }
      });
      break;
    default:
      break;
  }

  return res;
}

export async function generateProfileStruct(
  data: ProfileRecord,
  ns?: boolean,
  edges?: IdentityGraphEdge[]
): Promise<ProfileAPIResponse | ProfileNSResponse> {
  const nsObj = {
    address: data.address,
    identity: data.identity,
    platform: data.platform,
    displayName: data.displayName || data.identity,
    avatar: (await resolveEipAssetURL(data.avatar, data.identity)) || null,
    description: data.description || null,
  };

  return ns
    ? nsObj
    : {
        ...nsObj,
        email: data.texts?.email || null,
        location: data.texts?.location || null,
        header: (await resolveEipAssetURL(data.texts?.header)) || null,
        contenthash: data.contenthash || null,
        links: generateSocialLinks(data, edges) || {},
        social: data.social
          ? {
              ...data.social,
              uid: isNaN(data.social.uid)
                ? data.social.uid
                : Number(data.social.uid),
            }
          : {},
      };
}

const DEFAULT_PLATFORM_ORDER = [
  PlatformType.ens,
  PlatformType.basenames,
  PlatformType.ethereum,
  PlatformType.farcaster,
  PlatformType.lens,
  PlatformType.unstoppableDomains,
];

function sortProfilesByPlatform(
  responses: ProfileAPIResponse[] | ProfileNSResponse[],
  targetPlatform: PlatformType,
  handle: string
): ProfileAPIResponse[] {
  const order = DEFAULT_PLATFORM_ORDER.includes(targetPlatform)
    ? [
        targetPlatform,
        ...DEFAULT_PLATFORM_ORDER.filter((x) => x !== targetPlatform),
      ]
    : DEFAULT_PLATFORM_ORDER;

  const sortedResponses = responses.reduce(
    (acc, response) => {
      const { platform } = response;
      const index = order.indexOf(platform as PlatformType);
      if (index >= 0 && index < 6) {
        acc[index].push(response);
      }
      return acc;
    },
    Array.from({ length: 6 }, (_, i) =>
      i === 0
        ? [
            responses.find(
              (x) => x.identity === handle && x.platform === targetPlatform
            ),
          ]
        : []
    )
  );

  return sortedResponses.flat().filter(Boolean) as ProfileAPIResponse[];
}

export const resolveWithIdentityGraph = async ({
  platform,
  handle,
  ns,
}: {
  platform: PlatformType;
  handle: string;
  ns?: boolean;
}) => {
  const response = await queryIdentityGraph(
    handle,
    platform,
    GET_PROFILES(false)
  );

  if (!response?.data?.identity || response?.errors)
    return {
      identity: handle,
      platform,
      message: response.errors ? response.errors : ErrorMessages.notFound,
      code: response.errors ? 500 : 404,
    };
  const profilesArray = primaryDomainResolvedRequestArray(
    response,
    handle,
    platform
  )
    .reduce((pre, cur) => {
      if (
        !pre.some(
          (i) => i.platform === cur.platform && i.identity === cur.identity
        )
      ) {
        pre.push(cur);
      }
      return pre;
    }, new Array())
    .sort((a, b) => (a.isPrimary === b.isPrimary ? 0 : a.isPrimary ? -1 : 1));
  let responsesToSort = [];

  for (let i = 0; i < profilesArray.length; i++) {
    const obj = await generateProfileStruct(
      profilesArray[i] as any,
      ns,
      response.data.identity.identityGraph?.edges
    );
    responsesToSort.push(obj);
  }
  const returnRes = PLATFORMS_TO_EXCLUDE.includes(platform)
    ? responsesToSort
    : sortProfilesByPlatform(responsesToSort, platform, handle);

  if (!returnRes.length && platform === PlatformType.ethereum) {
    const nsObj = {
      address: handle,
      identity: handle,
      platform: PlatformType.ethereum,
      displayName: formatText(handle),
      avatar: null,
      description: null,
    };
    returnRes.push(
      (ns
        ? nsObj
        : {
            ...nsObj,
            email: null,
            location: null,
            header: null,
            links: {},
          }) as ProfileAPIResponse
    );
  }

  const uniqRes = returnRes.reduce((pre, cur) => {
    if (
      cur &&
      !pre.find(
        (x: ProfileAPIResponse) =>
          x.platform === cur.platform && x.identity === cur.identity
      )
    ) {
      pre.push(cur as ProfileAPIResponse);
    }
    return pre;
  }, [] as ProfileAPIResponse[]);

  return uniqRes.filter((x: ProfileAPIResponse) => !x?.error).length
    ? uniqRes
    : {
        identity: handle,
        code: 404,
        message: uniqRes[0]?.error || ErrorMessages.notFound,
        platform,
      };
};

export const resolveUniversalHandle = async (
  handle: string,
  platform: PlatformType,
  ns?: boolean
) => {
  const handleToQuery = prettify(handle);

  if (!handleToQuery || !platform)
    return errorHandle({
      identity: handle,
      platform: PlatformType.ens,
      code: 404,
      message: ErrorMessages.invalidIdentity,
    });

  if (
    platform === PlatformType.ethereum &&
    !isValidEthereumAddress(handleToQuery)
  )
    return errorHandle({
      identity: handle,
      platform: PlatformType.ethereum,
      code: 404,
      message: ErrorMessages.invalidAddr,
    });
  const res = (await resolveWithIdentityGraph({
    platform,
    handle: handleToQuery,
    ns,
  })) as any;

  if (res.message) {
    return errorHandle({
      identity: res.identity,
      platform: res.platform,
      code: res.code,
      message: res.message,
    });
  } else {
    return respondWithCache(JSON.stringify(res));
  }
};

export const resolveVerifiedLink = (
  key: PlatformType | string,
  edges?: IdentityGraphEdge[]
) => {
  const res = [] as PlatformType[];
  console.log(edges,'kkkk', key)
  if (!edges?.length) return res;

  edges
    .filter((x) => x.target === key)
    .forEach((x) => {
      const source = x.source.split(",")[0];
      if (!res.includes(source as PlatformType))
        res.push(source as PlatformType);
    });
  return res;
};
