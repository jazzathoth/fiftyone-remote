import { Selector } from "@fiftyone/components";
import { groupSlice, groupSlices, useSetGroupSlice } from "@fiftyone/state";
import React, { useCallback } from "react";
import { useRecoilValue } from "recoil";

const Slice = ({ value }: { className?: string; value: string }) => {
  return <>{value}</>;
};

const GroupSlice = () => {
  const slice = useRecoilValue(groupSlice);
  if (!slice) {
    throw new Error("slice not defined");
  }
  const setSlice = useSetGroupSlice();
  const groupSlicesValue = useRecoilValue(groupSlices);

  const useSearch = useCallback(
    (search: string) => {
      const values = groupSlicesValue.filter((name) => name.includes(search));
      return { values, total: values.length };
    },
    [groupSlicesValue]
  );

  return (
    <Selector
      inputStyle={{ height: 28 }}
      component={Slice}
      containerStyle={{
        marginLeft: "0.5rem",
        position: "relative",
      }}
      onSelect={async (slice) => {
        setSlice(slice);
        return slice;
      }}
      overflow={true}
      placeholder={"slice"}
      useSearch={useSearch}
      value={slice}
    />
  );
};

export default GroupSlice;
