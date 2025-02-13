import { errorHandle, respondWithCache } from "@/utils/base";
import { AuthHeaders, ErrorMessages } from "@/utils/types";
import { fetchUniversalBatch } from "../../[ids]/utils";
import { resolveUniversalParams } from "@/utils/utils";

export const handleUniversalBatchRequest = async (
  ids: string[],
  headers: AuthHeaders,
  ns: boolean
) => {
  if (!ids?.length)
    return errorHandle({
      identity: null,
      platform: "batch",
      code: 404,
      message: ErrorMessages.invalidIdentity,
    });
  try {
    const queryIds = resolveUniversalParams(ids);
    const json = (await fetchUniversalBatch(queryIds, ns, headers)) as any;

    if (json.code) {
      return errorHandle({
        identity: JSON.stringify(ids),
        platform: "batch",
        code: json.code,
        message: json.msg,
      });
    }

    return respondWithCache(JSON.stringify(json));
  } catch (e: any) {
    return errorHandle({
      identity: JSON.stringify(ids),
      platform: "batch",
      code: e.cause || 500,
      message: ErrorMessages.notFound,
    });
  }
};
