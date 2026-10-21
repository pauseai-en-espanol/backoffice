/**
 * A picker's messages (Mensajes, PLAN M5): one's own first, then the team's (PLAN R71), in the order given; each kind
 * under its name when there are both, so a title the two share still says whose it is.
 */
export const MessageOptions = ({
  options,
  text,
}: {
  options: readonly { value: string; title: string; mine: boolean }[];
  /** "Tuyos" and "Del equipo". */
  text: { mine: string; team: string };
}) => {
  const mine = options.filter((option) => option.mine);
  const team = options.filter((option) => !option.mine);
  const list = (some: typeof options) =>
    some.map((option) => (
      <option key={option.value} value={option.value}>
        {option.title}
      </option>
    ));
  return mine.length === 0 || team.length === 0 ? (
    <>{list(options)}</>
  ) : (
    <>
      <optgroup label={text.mine}>{list(mine)}</optgroup>
      <optgroup label={text.team}>{list(team)}</optgroup>
    </>
  );
};
