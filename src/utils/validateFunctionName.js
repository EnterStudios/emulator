function validateFunctionName(functionName) {
  if (typeof functionName !== 'string') {
    throw Error('invalid function name');
  }
  return functionName;
}

export default validateFunctionName;
