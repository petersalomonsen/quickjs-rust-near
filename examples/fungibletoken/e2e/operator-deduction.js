// The contract's QuickJS rejects numeric-separator BigInt literals
// (`86_400_000n` => SyntaxError). Use the constructor form.
const ONE_DAY_MS = BigInt("86400000");

function auth_key(user, operator) {
  return `auth::${user}::${operator}`;
}

function load_auth(user, operator) {
  const raw = env.get_data(auth_key(user, operator));
  if (!raw) return null;
  return JSON.parse(raw);
}

function store_auth(user, operator, entry) {
  env.set_data(auth_key(user, operator), JSON.stringify(entry));
}

function timestamp_ms_as_bigint() {
  return BigInt(env.block_timestamp_ms());
}

export function authorize_deduction() {
  const { operator_account, max_amount_per_day } = JSON.parse(env.input());
  if (!operator_account || !max_amount_per_day) {
    env.panic("must provide operator_account and max_amount_per_day");
    return;
  }
  // Validate that max_amount_per_day is a parseable u128 string.
  BigInt(max_amount_per_day);

  const user = env.predecessor_account_id();
  const now_ms = timestamp_ms_as_bigint().toString();

  store_auth(user, operator_account, {
    max_per_day: String(max_amount_per_day),
    last_reset_ms: now_ms,
    spent_since_reset: "0",
  });

  print(
    `AUTHORIZE user=${user} operator=${operator_account} max_per_day=${max_amount_per_day}`,
  );
}

export function revoke_deduction() {
  const { operator_account } = JSON.parse(env.input());
  if (!operator_account) {
    env.panic("must provide operator_account");
    return;
  }
  const user = env.predecessor_account_id();
  env.clear_data(auth_key(user, operator_account));
  print(`REVOKE user=${user} operator=${operator_account}`);
}

export function deduct() {
  const { user, amount, description } = JSON.parse(env.input());
  if (!user || !amount) {
    env.panic("must provide user and amount");
    return;
  }
  const operator = env.predecessor_account_id();
  const entry = load_auth(user, operator);
  if (!entry) {
    env.panic(`no authorisation for user=${user} operator=${operator}`);
    return;
  }

  const now_ms = timestamp_ms_as_bigint();
  let last_reset_ms = BigInt(entry.last_reset_ms);
  let spent = BigInt(entry.spent_since_reset);
  const max_per_day = BigInt(entry.max_per_day);
  const requested = BigInt(amount);

  if (now_ms - last_reset_ms > ONE_DAY_MS) {
    last_reset_ms = now_ms;
    spent = 0n;
  }

  if (spent + requested > max_per_day) {
    env.panic(
      `daily cap exceeded: spent=${spent} requested=${requested} max_per_day=${max_per_day}`,
    );
    return;
  }

  store_auth(user, operator, {
    max_per_day: max_per_day.toString(),
    last_reset_ms: last_reset_ms.toString(),
    spent_since_reset: (spent + requested).toString(),
  });

  env.ft_transfer_internal(user, operator, requested.toString());

  print(
    `DEDUCT user=${user} operator=${operator} amount=${requested} desc=${description ?? ""}`,
  );
}

export function view_authorisation() {
  const { user, operator_account } = JSON.parse(env.input());
  const raw = env.get_data(auth_key(user, operator_account));
  env.value_return(raw || "null");
}

export function view_spent_since_reset() {
  const { user, operator_account } = JSON.parse(env.input());
  const raw = env.get_data(auth_key(user, operator_account));
  const spent = raw ? JSON.parse(raw).spent_since_reset : "0";
  // Return the raw numeric string so callers can use JSON.parse and get a
  // string they can pass to BigInt directly.
  env.value_return(`"${spent}"`);
}
