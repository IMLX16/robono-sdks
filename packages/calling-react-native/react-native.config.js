export default { dependency: { platforms: {
  android: { sourceDir: './android', packageImportPath: 'import com.robono.calling.CallingPackage;', packageInstance: 'new CallingPackage()' },
  ios: { podspecPath: './RobonoCallingRuntime.podspec' },
} } };
