export const gql = (strings: TemplateStringsArray, ...values: any[]) =>
  strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');

export class GraphQLClient {
  request = jest.fn().mockResolvedValue({});
}

export default { GraphQLClient, gql };
