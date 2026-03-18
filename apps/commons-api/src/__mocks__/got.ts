const got = {
  get:    jest.fn().mockReturnValue({ json: jest.fn().mockResolvedValue({}) }),
  post:   jest.fn().mockReturnValue({ json: jest.fn().mockResolvedValue({}) }),
  put:    jest.fn().mockReturnValue({ json: jest.fn().mockResolvedValue({}) }),
  delete: jest.fn().mockReturnValue({ json: jest.fn().mockResolvedValue({}) }),
};

export default got;
export const { get, post, put } = got;
