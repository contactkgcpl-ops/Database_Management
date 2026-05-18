import { useEffect, useState } from "react";

export function useLoad(fn, deps = []) {
  const [data, setData] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    fn()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, deps);

  return { data, setData, error, loading, reload };
}
