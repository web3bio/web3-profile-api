import {
    NEXTID_GRAPHQL_ENDPOINT,
    generateProfileStruct,
  } from "../[handle]/utils";
  import { BATCH_GET_PROFILES } from "@/utils/query";
  import {
    ProfileAPIResponse,
    ProfileNSResponse,
  } from "@/utils/types";
export async function fetchIdentityGraphBatch(
    ids: string[],
    ns: boolean
  ): Promise<
    ProfileAPIResponse[] | ProfileNSResponse[] | { error: { message: string } }
  > {
    try {
      const response = await fetch(NEXTID_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
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
      let res = [];
      if (json?.data?.identities?.length > 0) {
        for (let i = 0; i < json.data.identities.length; i++) {
          const item = json.data.identities[i].profile;
  
          res.push(await generateProfileStruct(item, ns));
        }
      }
      return res;
    } catch (e: any) {
      return { error: e.message };
    }
  }